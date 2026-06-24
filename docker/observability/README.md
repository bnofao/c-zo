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
   `docker/observability` (or just paste `docker-compose.yml`). The service
   configs are inlined as Docker Compose `configs:` (rendered by Docker), so the
   compose is **self-contained** — it deploys identically from Git or raw-paste,
   with no dependency on the sibling `*.yaml` files at deploy time. (Those files
   stay the editable source of truth; keep them and the inline blocks in sync.)
2. Deploy. The stack joins Coolify's shared **`coolify`** network (declared
   `external: true`) and creates the named volumes.
3. **Ensure Grafana and `life` are on the `coolify` network** too (Coolify's
   default — most resources already are; check each resource → Networks).
   Grafana then resolves `tempo`/`loki`/`prometheus` by name; `life` reaches the
   collector at `http://otel-collector:4318` — no host port needed.
4. **Add the datasources**: mount `grafana-datasources.yaml` into Grafana at
   `/etc/grafana/provisioning/datasources/`, or recreate the three
   datasources from the file via the Grafana UI.
5. **Keep everything internal.** Do NOT publish Tempo/Loki/Prometheus, and do
   NOT publish the collector's OTLP ports — the receiver is **unauthenticated**,
   so a host-exposed `4318`/`4317` lets anyone inject/poison telemetry or flood
   the backends. If an app is genuinely off-network, bind to a private interface
   (`127.0.0.1:4318`) **and** add auth (bearer header / mTLS), never `0.0.0.0`
   bare.

### Why inline `configs:` (not bind mounts)

The four service configs live in this compose as top-level `configs:` with
inline `content:`, not as `volumes: ./x.yaml:/path` bind mounts. A single-file
bind mount is unreliable on Coolify: when the source path doesn't resolve at
deploy time, Docker silently creates an empty **directory** there and the
container sees the config as a folder (e.g. Prometheus fails: "config is a
directory"). `configs:` are materialized by Docker, so this can't happen.

Editing a config: change the sibling `*.yaml` file **and** the matching inline
block (they mirror each other). Inside inline `content:`, escape every literal
`$` as `$$` (Compose interpolates `${...}`) — e.g. the collector's
`$${env:PG_METRICS_*}` and, if you ever inline `grafana-datasources.yaml`, the
Loki derived field `$${__value.raw}`.

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
2. Set on the collector resource: `PG_METRICS_USER`, `PG_METRICS_PASSWORD`, and
   `PG_METRICS_ENDPOINT` (the managed DB's in-network `host:5432`); the
   `PG_METRICS_DATABASE` default is `czo`. The collector must share a network
   with Postgres.
3. In the compose's inline `otel_collector_config` (mirror it in
   `otel-collector-config.yaml`): uncomment the `postgresql:` receiver — keep
   the `$$` on `$${env:...}` — and add `postgresql` to the `metrics` pipeline's
   `receivers`.
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
