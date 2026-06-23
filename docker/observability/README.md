# Observability stack (Coolify)

Self-hosted **LGTM**-style stack for c-zo. You already run **Grafana**; this
adds the four components it needs:

| Service | Image | Role | Internal URL |
|---|---|---|---|
| **OTel Collector** | `otel/opentelemetry-collector-contrib` | OTLP ingest hub, fan-out | `otel-collector:4318` (OTLP/HTTP) |
| **Tempo** | `grafana/tempo` | Traces backend | `http://tempo:3200` |
| **Prometheus** | `prom/prometheus` | Metrics backend | `http://prometheus:9090` |
| **Loki** | `grafana/loki` | Logs backend | `http://loki:3100` |

Signal flow:

```
life (Effect Otlp.layerProtobuf)
   │  OTLP/HTTP  → http://otel-collector:4318
   ▼
OTel Collector ── traces  ─OTLP/gRPC→ tempo:4317
               ── metrics ─exposes :8889─→ scraped by Prometheus
               ── logs    ─OTLP/HTTP→ loki:3100/otlp/v1/logs
   ▼
Grafana ── Tempo + Prometheus + Loki datasources (correlated)
```

## Install in Coolify

1. **New resource → Docker Compose**, source = this Git repo, base directory
   `docker/observability`. (Git-based deploy makes the sibling `*.yaml`
   config files available to the bind mounts.)
2. Deploy. Coolify creates the `czo-observability` network and named volumes.
3. **Connect Grafana AND `life`** to the `czo-observability` network (each
   resource → Networks → attach `czo-observability`). Grafana then resolves
   `tempo`/`loki`/`prometheus` by name; `life` reaches the collector at
   `http://otel-collector:4318` — no host port needed.
4. **Add the datasources**: mount `grafana-datasources.yaml` into Grafana at
   `/etc/grafana/provisioning/datasources/`, or recreate the three
   datasources from the file via the Grafana UI.
5. **Keep everything internal.** Do NOT publish Tempo/Loki/Prometheus, and do
   NOT publish the collector's OTLP ports — the receiver is **unauthenticated**,
   so a host-exposed `4318`/`4317` lets anyone inject/poison telemetry or flood
   the backends. If an app is genuinely off-network, bind to a private interface
   (`127.0.0.1:4318`) **and** add auth (bearer header / mTLS), never `0.0.0.0`
   bare.

### Raw-paste mode (no Git deploy)

If you paste the compose instead of deploying from Git, the bind mounts won't
find the files. Replace each `volumes: ./x.yaml:...` with a top-level
`configs:` entry using inline `content: |` (paste the file body), and reference
it per service. Remember to escape every `$` as `$$` inside inline content
(e.g. the Loki derived-field `${__value.raw}` → `$${__value.raw}`).

## Wire `life` to the collector

Effect 4 exports OTLP natively — no `@opentelemetry` SDK needed for export.
Provide the combined layer pointing at the collector, plus an `HttpClient`.

```ts
// apps/life — telemetry layer (re-add to the boot composition)
import { Otlp } from 'effect/unstable/observability'
import { NodeHttpClient } from '@effect/platform-node' // or FetchHttpClient

const TelemetryLive = Otlp.layerProtobuf({
  baseUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318',
  resource: { serviceName: 'life', serviceVersion: '0.0.1' },
}).pipe(Layer.provide(NodeHttpClient.layerUndici))
```

Then `Layer.provide(TelemetryLive)` into the app runtime. `main.ts` currently
omits telemetry on purpose (`register-otel.mjs` only installs the ESM import
hook for `@opentelemetry` auto-instrumentation) — this is the step that
actually starts exporting.

Environment on the `life` resource:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=life
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

> `life` is Effect-native: the `@opentelemetry` SDK + auto-instrumentation
> were dropped. Query/PG spans come from `@effect/sql-pg`; HTTP-server root
> spans (h3) are **not** captured — wrap the handler in `Effect.withSpan`, or
> re-add the `@opentelemetry` SDK, if you need them.

## Postgres server metrics (opt-in)

App-side query spans (above) ≠ Postgres *server* metrics (connections,
commits, db/table/index sizes, replication, …). Those come from the
collector's `postgresql` receiver, which is **commented out by default** (it
hard-requires credentials and the collector won't start without them). To
enable:

1. Create a read-only monitoring role on Postgres:
   ```sql
   CREATE ROLE otel_metrics LOGIN PASSWORD '<strong-password>';
   GRANT pg_monitor TO otel_metrics;   -- built-in role: access to stats views
   ```
2. Set on the collector resource: `PG_METRICS_USER`, `PG_METRICS_PASSWORD`
   (and `PG_METRICS_ENDPOINT` / `PG_METRICS_DATABASE` if not the defaults
   `postgres:5432` / `db_password_manager`). The collector must share a network
   with Postgres.
3. In `otel-collector-config.yaml`: uncomment the `postgresql:` receiver and
   add `postgresql` to the `metrics` pipeline's `receivers`.
4. Import a Grafana dashboard for the `postgresqlreceiver` metric set
   (`postgresql.*`) on the Prometheus datasource.

(Alternative: the Prometheus-community `postgres_exporter` scraped by
Prometheus — pick one, not both, to avoid duplicate series.)

## Verify

- Collector health: `curl http://<collector>:13133` → `200`.
- Send a trace from `life`, then in Grafana → Explore → Tempo, search by
  service `life`.
- Metrics: Grafana → Explore → Prometheus, query `{job="otel-collector"}`.
- Logs: once the log-bridge ships, Grafana → Explore → Loki,
  `{service_name="life"}`.
