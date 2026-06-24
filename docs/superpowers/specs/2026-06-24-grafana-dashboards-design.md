# Grafana Dashboards (provisioning-as-code) — Design Spec

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan
**Related:** observability stack `docker/observability/` (PRs #155, #159, #160, #161)

## Goal

Provision three Grafana dashboards **as code** (file provider + JSON) for the c-zo observability stack, and enable the backend features they need: Tempo's metrics-generator (span metrics + service graphs → Prometheus) and the OTel Collector's self-telemetry. Grafana is a separately-managed Coolify resource; the artifacts are mounted into it.

Dashboards:
1. **life — traces** (Tempo + span metrics): service graph, RED (rate/errors/duration) per service, recent-traces TraceQL table.
2. **life — logs** (Loki): log volume, error count, log table for `{service_name="life"}`.
3. **OTel Collector health** (Prometheus, collector self-metrics): accepted/refused/sent/failed by signal, exporter queue, process heap/CPU.

## Non-Goals (YAGNI)

- **No PostgreSQL dashboard** (the `postgresql` receiver stays opt-in/commented).
- **No alerting rules** — dashboards only.
- **No Grafana service in the compose** — Grafana is user-managed; we ship mountable provisioning files.
- **No new datasources** — the three in `grafana-datasources.yaml` (uids `prometheus`/`tempo`/`loki`) are reused.

## Architecture

Signal flow after this change (additions in **bold**):

```
life ──OTLP──► otel-collector ──┬─ traces  ─► tempo ──┐
                                ├─ metrics ─► prometheus (:8889 scrape)
                                └─ logs    ─► loki
   otel-collector self-metrics  ─ :8888 ─► prometheus            **(new scrape)**
   tempo metrics-generator ─ span/service-graph metrics ─►       **(new)**
        prometheus remote-write (:9090/api/v1/write)             **(new flag)**
Grafana ◄─ datasources (tempo/prometheus/loki) + **3 provisioned dashboards**
```

Span metrics from Tempo's generator surface in Prometheus as `traces_spanmetrics_*` (calls, latency histogram) and `traces_service_graph_request_*`; the **life — traces** dashboard and the Tempo datasource's `serviceMap`/`tracesToMetrics` (already configured) consume them.

## Components

### 1. Dashboard provider — `docker/observability/grafana-dashboards.yaml`

```yaml
apiVersion: 1
providers:
  - name: czo
    orgId: 1
    folder: c-zo
    type: file
    disableDeletion: false
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
```

Mounted at `/etc/grafana/provisioning/dashboards/grafana-dashboards.yaml`; the JSON files mount at `/var/lib/grafana/dashboards/`.

### 2. Dashboards — `docker/observability/dashboards/*.json`

Each is a self-contained Grafana dashboard JSON (schemaVersion ≥ 39, no `__inputs`/`__requires` — provisioned dashboards can't prompt for inputs). Datasources referenced by fixed uid (`{"type":"prometheus","uid":"prometheus"}`, etc.) matching `grafana-datasources.yaml`. Each sets a stable `uid` and `title`, `time` default `now-1h`, refresh `30s`.

- **`life-traces.json`** — panels: service graph (nodeGraph, Tempo datasource service map) ; request rate `sum by (span_name) (rate(traces_spanmetrics_calls_total{service_name="life"}[$__rate_interval]))` ; error rate (same with `status_code="STATUS_CODE_ERROR"`) ; latency p50/p95/p99 via `histogram_quantile(…, sum by (le) (rate(traces_spanmetrics_latency_bucket{service_name="life"}[$__rate_interval])))` ; recent traces table (Tempo, TraceQL `{ resource.service.name = "life" }`).
- **`life-logs.json`** — panels: log volume timeseries `sum(count_over_time({service_name="life"}[$__interval]))` ; error count `sum(count_over_time({service_name="life"} |~ "(?i)error|fatal" [$__interval]))` ; logs panel `{service_name="life"}`. All Loki datasource.
- **`otel-collector.json`** — panels (Prometheus, collector self-metrics): accepted vs refused spans/metric-points/log-records (`rate(otelcol_receiver_accepted_spans[$__rate_interval])`, `…_refused_…`) ; exporter sent vs send-failed (`otelcol_exporter_sent_spans`, `otelcol_exporter_send_failed_spans`) ; exporter queue size/capacity (`otelcol_exporter_queue_size`, `otelcol_exporter_queue_capacity`) ; process `otelcol_process_runtime_heap_alloc_bytes`, `rate(otelcol_process_cpu_seconds[$__rate_interval])`.

### 3. Tempo metrics-generator — `tempo.yaml` (+ inline `tempo_config` in compose)

Add:
```yaml
metrics_generator:
  registry:
    external_labels:
      source: tempo
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write
        send_exemplars: true
  traces_storage:
    path: /var/tempo/generator/traces
  processor:
    span_metrics: {}
    service_graphs: {}

overrides:
  defaults:
    metrics_generator:
      processors: [span-metrics, service-graphs]
```

### 4. Prometheus — `prometheus.yml` (+ inline) and compose `command`

- `prometheus.yml`: add a scrape job for collector self-metrics:
  ```yaml
  - job_name: otel-collector-self
    static_configs:
      - targets: ["otel-collector:8888"]
  ```
- compose `prometheus.command`: add `--web.enable-remote-write-receiver` (Tempo's generator writes to `:9090/api/v1/write`). v3.1.0 supports it.

### 5. Collector self-telemetry — `otel-collector-config.yaml` (+ inline)

Expose internal metrics on a scrapable address (default is `localhost:8888`, unreachable from Prometheus's container):
```yaml
service:
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus:
                host: 0.0.0.0
                port: 8888
```
(If `readers` is unsupported on `otel/opentelemetry-collector-contrib:0.119.0`, fall back to the deprecated `service.telemetry.metrics.address: 0.0.0.0:8888` — the plan verifies which the pinned image accepts.)

### 6. README — mounting into Grafana

Document, in `docker/observability/README.md`, mounting on the Coolify Grafana resource (Storages → file mounts): `grafana-dashboards.yaml` → `/etc/grafana/provisioning/dashboards/grafana-dashboards.yaml`, and the `dashboards/` dir → `/var/lib/grafana/dashboards/`. Note the metrics-generator/remote-write additions and that span metrics take a few minutes to appear.

## Mirror Constraint (critical)

`docker-compose.yml` (the observability stack) carries **inline copies** of `tempo_config`, `prometheus_config`, and `otel_collector_config` under top-level `configs:`. Every edit to `tempo.yaml` / `prometheus.yml` / `otel-collector-config.yaml` MUST be mirrored into the matching inline block. (`grafana-datasources.yaml` and the new dashboards are NOT in the compose — they mount into the separate Grafana resource.)

## Verification

Boot the stack locally on a shared network, drive a trace, and observe:
1. `docker compose config` parses; stack starts — Tempo logs the generator active, Prometheus starts with the remote-write receiver, collector exposes `:8888`.
2. `curl otel-collector:8888/metrics` returns `otelcol_*`; Prometheus target `otel-collector-self` is up.
3. Send a synthetic OTLP trace (service `life`) to the collector → within ~1–2 min, Prometheus has `traces_spanmetrics_calls_total{service_name="life"}` and `traces_service_graph_request_total`.
4. Run a throwaway Grafana with the datasources + dashboards provisioning mounted → Grafana logs show all three dashboards provisioned with no errors; datasources resolve; the traces dashboard's rate panel returns the synthetic series, the logs dashboard queries Loki, the collector dashboard shows `otelcol_*`.

Because Grafana here is user-managed, the dashboards are verified against a throwaway Grafana wired to the same stack — proving the JSON is valid and panels bind to the provisioned datasource uids.
