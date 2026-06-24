# Grafana Dashboards (provisioning-as-code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision three Grafana dashboards as code (file provider + JSON) and enable the backend metrics they need — Tempo's metrics-generator (span metrics + service graphs → Prometheus remote-write) and the OTel Collector's self-telemetry.

**Architecture:** All work lives under `docker/observability/`. The observability `docker-compose.yml` carries inline copies of the Tempo/Prometheus/collector configs (top-level `configs:`); the sibling `*.yaml` files are the editable source of truth. Dashboards mount into the separately-managed Grafana resource. Verification is runtime: boot the stack, drive a synthetic trace, and confirm span metrics + dashboard provisioning.

**Tech Stack:** Grafana provisioning (file provider), Tempo 2.7.1 metrics-generator, Prometheus v3.1.0 remote-write receiver, `otel/opentelemetry-collector-contrib:0.119.0`, Docker Compose.

## Global Constraints

- **Commit discipline (project override):** Stage with `git add` only. Do **not** `git commit` per task. One commit at the end after user review. Never `git stash`.
- **Mirror constraint:** every edit to `docker/observability/{tempo.yaml,prometheus.yml,otel-collector-config.yaml}` MUST be mirrored into the matching inline block (`tempo_config` / `prometheus_config` / `otel_collector_config`) under `configs:` in `docker/observability/docker-compose.yml`. Inline blocks are indented 6 spaces under `content: |`.
- **Datasource uids:** dashboards reference datasources by fixed uid — `prometheus`, `tempo`, `loki` — matching `grafana-datasources.yaml`.
- **Dashboard JSON:** provisioned dashboards must NOT contain `__inputs`/`__requires`/`id`; each sets a stable `uid` and `title`, `schemaVersion: 39`, `time: {from: "now-1h", to: "now"}`, `refresh: "30s"`.
- **Span-metric names (Tempo generator → Prometheus):** `traces_spanmetrics_calls_total`, `traces_spanmetrics_latency_bucket`, `traces_service_graph_request_total`. **Tempo 2.7.1 labels span metrics with `service` (NOT `service_name`)** — the traces dashboard's Prometheus queries use `{service="life"}` (verified at runtime in Task 1). The Loki logs dashboard uses `{service_name="life"}` (that's the Loki label, unrelated).
- **Prometheus remote-write:** enabled via the CLI flag `--web.enable-remote-write-receiver` (endpoint `http://prometheus:9090/api/v1/write`).
- **Local verification networking:** the compose declares `coolify` as an **external** network, which does not exist locally — create it first: `docker network create coolify` (and `docker network rm coolify` at teardown).

---

### Task 1: Enable the span-metrics + self-metrics pipeline

**Files:**
- Modify: `docker/observability/tempo.yaml` (add `metrics_generator` + `overrides`)
- Modify: `docker/observability/prometheus.yml` (add `otel-collector-self` scrape job)
- Modify: `docker/observability/otel-collector-config.yaml` (expose internal metrics on `0.0.0.0:8888`)
- Modify: `docker/observability/docker-compose.yml` (mirror the three configs in their inline `configs:` blocks; add `--web.enable-remote-write-receiver` to the `prometheus` service `command`)

**Interfaces:**
- Produces: Prometheus series `traces_spanmetrics_calls_total{service="..."}`, `traces_spanmetrics_latency_bucket`, `traces_service_graph_request_total`, and `otelcol_*` self-metrics — consumed by the Task 2 dashboards.

- [ ] **Step 1: Add the metrics-generator to `tempo.yaml`**

Append to `docker/observability/tempo.yaml` (after the existing `storage:` block, before `usage_report:`):

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

- [ ] **Step 2: Add the collector self-metrics scrape to `prometheus.yml`**

In `docker/observability/prometheus.yml`, add a third job under `scrape_configs:` (after the `prometheus` job):

```yaml
  - job_name: otel-collector-self
    static_configs:
      - targets: ["otel-collector:8888"]   # collector internal telemetry
```

- [ ] **Step 3: Expose collector internal metrics in `otel-collector-config.yaml`**

In `docker/observability/otel-collector-config.yaml`, replace the `service:` block's opening so it carries a `telemetry` section (keep the existing `extensions:` and `pipelines:`):

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
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]   # add `postgresql` here once the receiver above is enabled
      processors: [memory_limiter, resource, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp/loki]
```

- [ ] **Step 4: Mirror the three edits into the inline `configs:` of `docker-compose.yml`**

In `docker/observability/docker-compose.yml`, apply Steps 1–3 verbatim inside the matching `content: |` blocks: `tempo_config` (Step 1), `prometheus_config` (Step 2), `otel_collector_config` (Step 3). Preserve the 6-space inline indentation. Do NOT introduce `$` (none of these edits contain `$`, so no `$$` escaping needed).

- [ ] **Step 5: Add the remote-write receiver flag to the prometheus service**

In `docker/observability/docker-compose.yml`, the `prometheus` service `command:` currently is:

```yaml
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=14d"
```

Add the flag:

```yaml
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=14d"
      - "--web.enable-remote-write-receiver"
```

- [ ] **Step 6: Validate the compose parses**

Run from `docker/observability/`:
```bash
docker compose -f docker-compose.yml config >/dev/null && echo "CONFIG OK"
```
Expected: `CONFIG OK`.

- [ ] **Step 7: Boot the stack on a local `coolify` network**

```bash
docker network create coolify
cd docker/observability
docker compose -f docker-compose.yml up -d
# wait for tempo + prometheus + collector to be running
sleep 15
docker compose ps --format '{{.Service}} {{.State}}'
```
Expected: `otel-collector`, `tempo`, `loki`, `prometheus` all `running`.

- [ ] **Step 8: Confirm the collector exposes self-metrics and Prometheus scrapes them**

```bash
docker compose exec otel-collector wget -qO- http://localhost:8888/metrics 2>/dev/null | grep -m1 otelcol_ || echo "NO :8888"
```
Expected: at least one `otelcol_*` line (collector image is distroless; if `wget` is absent, run instead:
`docker run --rm --network coolify curlimages/curl -s http://otel-collector:8888/metrics | grep -m1 otelcol_`).

```bash
docker run --rm --network coolify curlimages/curl -s 'http://prometheus:9090/api/v1/targets?state=active' | grep -o '"job":"otel-collector-self"[^}]*"health":"up"' || echo "self-target not up yet"
```
Expected: the `otel-collector-self` target shows `"health":"up"` (allow a scrape interval; retry after ~20s).

> If the collector fails to start citing `service.telemetry.metrics.readers`, the pinned image wants the legacy form: replace the Step 3 `telemetry:` block with `telemetry:\n    metrics:\n      address: 0.0.0.0:8888` (and mirror it), then repeat Steps 6–8.

- [ ] **Step 9: Drive a synthetic trace and confirm span metrics land in Prometheus**

```bash
docker run --rm --network coolify \
  ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:v0.119.0 \
  traces --otlp-endpoint otel-collector:4317 --otlp-insecure \
  --service life --traces 50
sleep 60   # generator scrape + remote_write
docker run --rm --network coolify curlimages/curl -s \
  'http://prometheus:9090/api/v1/query?query=traces_spanmetrics_calls_total' \
  | grep -o '"service_name":"life"' | head -1 || echo "no span metrics yet"
```
Expected: a `"service_name":"life"` match — proving Tempo's generator produced span metrics and remote-wrote them to Prometheus.

- [ ] **Step 10: Tear down**

```bash
cd docker/observability
docker compose -f docker-compose.yml down -v
docker network rm coolify
```
Expected: containers/volumes/network removed.

- [ ] **Step 11: Stage**

```bash
git add docker/observability/tempo.yaml docker/observability/prometheus.yml \
        docker/observability/otel-collector-config.yaml docker/observability/docker-compose.yml
git status --short
```
Expected: the four files staged. (Do **not** commit.)

---

### Task 2: Provision the three dashboards

**Files:**
- Create: `docker/observability/grafana-dashboards.yaml` (dashboard provider)
- Create: `docker/observability/dashboards/life-logs.json`
- Create: `docker/observability/dashboards/life-traces.json`
- Create: `docker/observability/dashboards/otel-collector.json`

**Interfaces:**
- Consumes: Task 1's Prometheus series; the datasources from `grafana-datasources.yaml` (uids `prometheus`/`tempo`/`loki`).

- [ ] **Step 1: Write the dashboard provider**

Create `docker/observability/grafana-dashboards.yaml`:

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

- [ ] **Step 2: Write `life-logs.json` (this is the canonical JSON template)**

Create `docker/observability/dashboards/life-logs.json`. This is a complete, valid provisioned dashboard — use its structure (top-level keys, `datasource` shape, `gridPos`, `targets`) as the template for the other two.

```json
{
  "uid": "czo-life-logs",
  "title": "life — logs",
  "schemaVersion": 39,
  "version": 1,
  "editable": true,
  "refresh": "30s",
  "time": { "from": "now-1h", "to": "now" },
  "timezone": "",
  "tags": ["c-zo", "life", "logs"],
  "templating": { "list": [] },
  "annotations": { "list": [] },
  "panels": [
    {
      "id": 1,
      "title": "Log volume",
      "type": "timeseries",
      "datasource": { "type": "loki", "uid": "loki" },
      "gridPos": { "h": 8, "w": 16, "x": 0, "y": 0 },
      "targets": [
        { "refId": "A", "datasource": { "type": "loki", "uid": "loki" },
          "expr": "sum(count_over_time({service_name=\"life\"}[$__interval]))" }
      ]
    },
    {
      "id": 2,
      "title": "Errors (1h)",
      "type": "stat",
      "datasource": { "type": "loki", "uid": "loki" },
      "gridPos": { "h": 8, "w": 8, "x": 16, "y": 0 },
      "targets": [
        { "refId": "A", "datasource": { "type": "loki", "uid": "loki" },
          "expr": "sum(count_over_time({service_name=\"life\"} |~ \"(?i)error|fatal\"[$__range]))" }
      ]
    },
    {
      "id": 3,
      "title": "Logs",
      "type": "logs",
      "datasource": { "type": "loki", "uid": "loki" },
      "gridPos": { "h": 14, "w": 24, "x": 0, "y": 8 },
      "options": { "showTime": true, "wrapLogMessage": true, "sortOrder": "Descending" },
      "targets": [
        { "refId": "A", "datasource": { "type": "loki", "uid": "loki" },
          "expr": "{service_name=\"life\"}" }
      ]
    }
  ]
}
```

- [ ] **Step 3: Write `life-traces.json`**

Create `docker/observability/dashboards/life-traces.json` following the template structure (`uid": "czo-life-traces"`, `title": "life — traces"`, tags `["c-zo","life","traces"]`). Panels:

| id | title | type | datasource uid | target query (`expr`) |
|----|-------|------|----------------|------------------------|
| 1 | Request rate (by span) | timeseries | prometheus | `sum by (span_name) (rate(traces_spanmetrics_calls_total{service="life"}[$__rate_interval]))` |
| 2 | Error rate (by span) | timeseries | prometheus | `sum by (span_name) (rate(traces_spanmetrics_calls_total{service="life",status_code="STATUS_CODE_ERROR"}[$__rate_interval]))` |
| 3 | Latency p95 | timeseries | prometheus | `histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="life"}[$__rate_interval])))` |
| 4 | Service graph | nodeGraph | tempo | target `{ "refId": "A", "datasource": {"type":"tempo","uid":"tempo"}, "queryType": "serviceMap" }` |
| 5 | Recent traces | table | tempo | target `{ "refId": "A", "datasource": {"type":"tempo","uid":"tempo"}, "queryType": "traceql", "query": "{ resource.service.name = \"life\" }", "limit": 20 }` |

Lay out with `gridPos` (panels 1–3 at `w:8` across `y:0`; panel 4 `w:12,h:10,y:8`; panel 5 `w:12,h:10,x:12,y:8`). Prometheus panels use `datasource {type:"prometheus",uid:"prometheus"}` on both panel and target.

- [ ] **Step 4: Write `otel-collector.json`**

Create `docker/observability/dashboards/otel-collector.json` following the template (`uid": "czo-otel-collector"`, `title": "OTel Collector"`, tags `["c-zo","otel"]`). All panels Prometheus datasource (uid `prometheus`), type `timeseries` unless noted:

| id | title | expr |
|----|-------|------|
| 1 | Spans accepted vs refused | `rate(otelcol_receiver_accepted_spans[$__rate_interval])` and `rate(otelcol_receiver_refused_spans[$__rate_interval])` (two targets A/B) |
| 2 | Spans sent vs failed | `rate(otelcol_exporter_sent_spans[$__rate_interval])` and `rate(otelcol_exporter_send_failed_spans[$__rate_interval])` |
| 3 | Exporter queue size | `otelcol_exporter_queue_size` and `otelcol_exporter_queue_capacity` |
| 4 | Heap alloc | `otelcol_process_runtime_heap_alloc_bytes` |
| 5 | CPU | `rate(otelcol_process_cpu_seconds[$__rate_interval])` |

Lay out `w:12,h:8` two-per-row.

- [ ] **Step 5: Validate every dashboard JSON is well-formed**

```bash
for f in docker/observability/dashboards/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK $f')" || exit 1
done
```
Expected: `OK` for all three files.

- [ ] **Step 6: Verify provisioning in a throwaway Grafana wired to the stack**

Bring the stack up on a local network and drive a trace so the traces dashboard has data:

```bash
docker network create coolify
docker compose -f docker/observability/docker-compose.yml up -d
sleep 15
docker run --rm --network coolify \
  ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:v0.119.0 \
  traces --otlp-endpoint otel-collector:4317 --otlp-insecure --service life --traces 50
sleep 60
```

Then run Grafana on the same network with datasources + dashboards mounted:

```bash
OBS=$(pwd)/docker/observability
docker run -d --name czo-grafana --network coolify -p 3001:3000 \
  -e GF_AUTH_ANONYMOUS_ENABLED=true -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
  -v "$OBS/grafana-datasources.yaml":/etc/grafana/provisioning/datasources/ds.yaml:ro \
  -v "$OBS/grafana-dashboards.yaml":/etc/grafana/provisioning/dashboards/db.yaml:ro \
  -v "$OBS/dashboards":/var/lib/grafana/dashboards:ro \
  grafana/grafana:11.5.0
sleep 12
echo "--- provisioning errors? (expect none) ---"
docker logs czo-grafana 2>&1 | grep -iE "provisioning.*error|failed to load dashboard|invalid" || echo "no provisioning errors"
echo "--- dashboards registered? ---"
curl -s http://admin:admin@localhost:3001/api/search?type=dash-db | grep -o '"title":"[^"]*"'
echo "--- datasources resolve? ---"
curl -s http://admin:admin@localhost:3001/api/datasources | grep -o '"name":"[^"]*"'
```
Expected: no provisioning errors; the three titles (`life — logs`, `life — traces`, `OTel Collector`) appear; datasources `Prometheus`/`Tempo`/`Loki` listed.

- [ ] **Step 7: Confirm key panels return data**

```bash
# traces dashboard data (Prometheus span metrics)
curl -s 'http://admin:admin@localhost:3001/api/datasources/proxy/uid/prometheus/api/v1/query?query=traces_spanmetrics_calls_total{service="life"}' | grep -o '"status":"success"'
# collector dashboard data
curl -s 'http://admin:admin@localhost:3001/api/datasources/proxy/uid/prometheus/api/v1/query?query=otelcol_receiver_accepted_spans' | grep -o '"status":"success"'
```
Expected: `"status":"success"` for both (the traces query returns series only if a trace was driven in this run).

- [ ] **Step 8: Tear down**

```bash
docker rm -f czo-grafana
docker compose -f docker/observability/docker-compose.yml down -v
docker network rm coolify
```

- [ ] **Step 9: Stage**

```bash
git add docker/observability/grafana-dashboards.yaml docker/observability/dashboards
git status --short
```
Expected: the provider + three JSON staged. Do **not** commit.

---

### Task 3: Document mounting + the backend additions in the README

**Files:**
- Modify: `docker/observability/README.md`

**Interfaces:**
- Consumes: file names/paths from Tasks 1–2.

- [ ] **Step 1: Add a "Dashboards" section**

In `docker/observability/README.md`, after the datasources step (step 4 of "Install in Coolify"), add:

```markdown
### Dashboards (provisioned)

Three dashboards ship as code in `dashboards/` with the provider
`grafana-dashboards.yaml`. On the Grafana resource (Storages → file mounts):

- `grafana-dashboards.yaml` → `/etc/grafana/provisioning/dashboards/grafana-dashboards.yaml`
- the `dashboards/` directory → `/var/lib/grafana/dashboards/`

They land in a **c-zo** folder: **life — logs** (Loki), **life — traces**
(Tempo span metrics + service graph), **OTel Collector** (collector
self-metrics). Span-metric panels need the Tempo metrics-generator (below) and
take a few minutes to populate after first traffic.
```

- [ ] **Step 2: Document the backend additions**

Append to the "Postgres server metrics (opt-in)" area a short subsection:

```markdown
## Span metrics & service graph (enabled)

Tempo's metrics-generator derives RED span metrics (`traces_spanmetrics_*`) and
service-graph metrics (`traces_service_graph_*`) from incoming traces and
remote-writes them to Prometheus (which runs with
`--web.enable-remote-write-receiver`). The collector also exposes its own
telemetry on `:8888`, scraped by the `otel-collector-self` Prometheus job. These
power the **life — traces** and **OTel Collector** dashboards.
```

- [ ] **Step 3: Verify the doc edits**

```bash
grep -n "Dashboards (provisioned)" docker/observability/README.md
grep -n "Span metrics & service graph" docker/observability/README.md
```
Expected: both headings present.

- [ ] **Step 4: Stage**

```bash
git add docker/observability/README.md
git status --short
```
Expected: README staged alongside the Task 1–2 files. Do **not** commit.

---

## Notes for the executor

- Produces **staged** changes only; after all tasks + review, surface the staged diff for the single commit + PR decision.
- The design doc `docs/superpowers/specs/2026-06-24-grafana-dashboards-design.md` and this plan are untracked; whether to include them in the commit is the user's call.
- Coolify-specific behavior (file mounts into the user-managed Grafana, the live `coolify` network) is verified by proxy locally — a throwaway Grafana with the same provisioning mounts and a locally-created `coolify` network. The dashboards' validity, datasource binding, and the metric pipeline are all exercised; only the Coolify UI mount step is manual.
