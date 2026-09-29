# manishOps — Architecture & Product Spec

> Written for: the engineer(s) evolving this repo into a SaaS observability platform.
> Principle: **evolve, don't rewrite.** Keep what works, refactor in slices, ship incrementally.

---

## 1. Executive overview

manishOps is a multi-tenant **DevOps/SRE observability & operations platform**. It does not just draw charts — it moves a user through:

```
COLLECT → CONTEXTUALIZE → DETECT → EXPLAIN → ALERT → DRILL DOWN → RESPOND → LEARN
```

**Stack (fixed — do not expand without cause):** React+Vite (frontend) · Node.js/Express (control plane) · Python/FastAPI (ML) · PostgreSQL (relational state) · Prometheus (metrics, source of truth) · Grafana (optional deep dashboards) · Docker/K8s/Terraform/GitHub Actions (delivery).

**Core architectural rule:** Prometheus/Loki store time-series; **Postgres stores only control-plane state** (orgs, users, integrations, alerts config, incidents, deployments metadata, AI results). Never copy high-frequency metrics into Postgres.

---

## 2. Current architecture assessment

The repo today is a **single-tenant** working platform. It is a strong base. Verdicts per area:

| Path | Responsibility today | Verdict | Why |
|------|---------------------|---------|-----|
| `backend/app.js` | Express wiring, routes, proxies, static UI | **REFACTOR/SPLIT** | Growing god-file; split routes into modules (`src/routes/*`) and a small `app` factory |
| `backend/src/db.js` | pg pool | **KEEP** | Solid. Add per-query tenant scoping later |
| `backend/src/auth.js` | signup/login/verify/JWT | **KEEP/EXTEND** | Add orgs, memberships, RBAC, Google OAuth |
| `backend/src/metrics.js` | app Prometheus metrics | **KEEP** | Correct pattern |
| `backend/src/logger.js` | pino + ring buffer | **KEEP** | Ring buffer fine for demo; Loki later |
| `backend/src/loganalyzer.js` | log clustering + issue detection | **KEEP/MOVE** → `src/logs/` | Real value; becomes the "Intelligent Log Analysis" AI feature |
| `backend/src/routes/tasks.js` | tasks CRUD | **KEEP** | Becomes "incident tasks / action items" |
| `ai/ml/` | FastAPI IsolationForest anomaly | **KEEP/SPLIT** → `anomaly/ forecasting/ rca/` | Good base; split by capability |
| `frontend/src/components/*View.jsx` | 15+ pages | **KEEP/REORG** → `dashboards/{sre,devops,infra}/` | Regroup into the 3 product dashboards |
| `frontend/src/hooks/useTelemetry.js` | polls app metrics | **KEEP/GENERALIZE** | Generalize to a Prometheus query hook |
| `frontend/src/lib/prom.js` | prom text parser | **KEEP** | Used by app-metrics view |
| `database/migrations/` | 001 tasks, 002 users | **KEEP/EXTEND** | Add org/rbac/integration/incident tables |
| `monitoring/` | Prometheus+Grafana+exporters+dashboards | **KEEP/REORG** → subfolders | Add `alertmanager/` |
| `k8s/`, `infra/terraform/` | manifests + RDS IaC | **KEEP** | Terraform grows to full platform later |
| `.github/workflows/` | CI/CD | **KEEP/EXTEND** | Emit deployment metadata to backend (DORA) |

**Nothing here should be thrown away.** The gaps are: multi-tenancy, RBAC, integrations layer, the 3 segmented dashboards, alerting/incidents as first-class, and the AI "explain/correlate" features.

---

## 3. Target structure (incremental — folders added as slices land)

```
backend/src/
  app.js                # thin factory
  auth/                 # authN + org/membership/RBAC  (from auth.js)
  tenants/              # orgs, environments, membership
  integrations/         # prometheus/ grafana/ github/ kubernetes/ (adapters)
  alerts/  incidents/  deployments/  metrics/  logs/  reports/  ai/
  db.js  logger.js  metrics.js
ai/ml/
  anomaly/ forecasting/ rca/ log-analysis/ models/
frontend/src/
  dashboards/{sre,devops,infrastructure}/
  components/ hooks/ services/ lib/
monitoring/{prometheus,grafana,alertmanager,exporters}/
database/{migrations,seeds}/
docs/
```

Do the moves **one domain at a time**, keeping the app running after each.

---

## 4. System & data flow

```
                         ┌──────────── Browser (React) ────────────┐
                         │  auth token · org/env context · charts   │
                         └───────────────┬──────────────────────────┘
                                         │ HTTPS (JWT)
                                ┌────────▼─────────┐
                                │ Node control     │  authN/Z, tenants, config,
                                │ plane (Express)  │  incidents, integrations,
                                │  = the ONLY thing│  proxies (no creds to client)
                                │  browser talks to│
                                └───┬───────┬──────┘
              query (server-side)   │       │  results
         ┌──────────────┬──────────┘       └────────────┐
         ▼              ▼                                ▼
   Prometheus HTTP   Postgres (control state)       Python ML (FastAPI)
   (metrics ToT)     orgs/users/rbac/incidents/     anomaly/forecast/rca
   + Loki (logs)     integrations/ai_results        (reads Prom features)
         ▲
   exporters (kube-state-metrics, node-exporter, cAdvisor) + app /metrics
```

**Rule enforced here:** the browser never reaches Prometheus/Grafana/K8s/DB directly — the Node plane proxies with server-held credentials (you already do this for `/api/prom`, `/api/ml`).

---

## 5. Authentication & RBAC

- **AuthN:** email+password (done) **+ Google OAuth** (OIDC). JWT (access, short TTL) + refresh token (httpOnly cookie) for SaaS.
- **AuthZ:** RBAC scoped to org: `Owner > Admin > SRE > DevOps > Viewer`.
- Every request carries `{ userId, orgId, role }` (from JWT + membership lookup). A middleware `requireRole(min)` guards routes.
- **Ethical guardrail (product principle):** monitoring data is never used to rank/score individual employees. No per-user performance metrics. Build trust, not surveillance.

Roles → capabilities (matrix, abridged):

| Capability | Owner | Admin | SRE | DevOps | Viewer |
|---|---|---|---|---|---|
| View dashboards | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ack/resolve incidents | ✓ | ✓ | ✓ | ✓ | – |
| Configure alerts | ✓ | ✓ | ✓ | ✓ | – |
| Manage integrations | ✓ | ✓ | – | – | – |
| Manage members/billing | ✓ | ✓ | – | – | – |
| Delete org | ✓ | – | – | – | – |

---

## 6. Multi-tenant model

```
Organization ─┬─ Members (User + Role)
              ├─ Environments (prod/staging/dev)
              │     └─ Data sources (Prometheus URL, K8s ctx, GitHub repo…)
              └─ Dashboards / Alerts / Incidents / Deployments  (all scoped by org_id + env_id)
```

- **Isolation:** shared DB, **row-level scoping by `org_id`** on every table + every query (cheapest, safe). Postgres RLS policies as a second layer later.
- Tenant context resolved once per request in middleware; all queries filter by it.

---

## 7–10. The three dashboards (metrics **with context**)

Every metric shows: **current · baseline (7d) · target/SLO · trend · status**. Never a bare number.

### SRE — "Is the service reliable, must we act?"
Availability, success rate, error rate, throughput, **P50/P95/P99 latency**, SLIs/SLOs, **error budget burn**, MTTR, MTBF, active incidents, alert volume, on-call, service health, incident history.
Example tile: `Latency P95 — 180ms · target <300ms · 7d base 165ms · ↑8% · WITHIN SLO`.

### DevOps — "How healthy is delivery?" (DORA-centric)
**Deployment frequency, lead time, change-failure rate, time-to-restore** (the 4 DORA), plus build/test duration, pass rate, pipeline success/failure, queue/deploy duration, rollbacks. **Normalize GitHub Actions + Jenkins into one internal `pipeline_run` model** so the UI is provider-agnostic.

### Infrastructure — "Is the substrate healthy?"
K8s: node health, CPU/mem/disk, pod count/restarts/pending/failed, CrashLoopBackOff, scheduling failures, requests-vs-limits, HPA replicas, deployment availability. Hosts: CPU/RAM/disk/net/load/uptime. (You already have the PromQL for most in `monitoring/dashboards/kubernetes-namespaces.json` + `KubernetesView.jsx`.)

---

## 11. Metric catalog (source → PromQL → context)

| Signal | PromQL (source) | Context stored in PG |
|---|---|---|
| Error rate | `sum(rate(http_requests_total{status=~"5.."}[5m]))/sum(rate(http_requests_total[5m]))` | SLO target, budget |
| P95 latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` | target, 7d baseline |
| Pod restarts | `increase(kube_pod_container_status_restarts_total[15m])` | threshold |
| Node CPU | `1-avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))` | capacity target |
| Deploy freq | *(from `deployments` table)* | DORA band |

Baselines/targets/SLOs live in Postgres (`slos`, `metric_context`); values come live from Prometheus.

---

## 12–14. Integrations, alerting, incidents

- **Integrations** = adapters under `backend/src/integrations/*` behind one interface: `getMetrics()`, `getPipelines()`, `getK8s()`. GitHub Actions + Jenkins both map → internal `pipeline_run`. Credentials in Postgres **encrypted** (AES-GCM, key from KMS/secret), never sent to browser.
- **Alerting:** Prometheus rule → **Alertmanager** → webhook into Node → persist `alert_event` → fan out (dashboard/email/Slack). Alerts carry context (current, baseline, duration, env, service, related deploy).
- **Incidents:** first-class table; open on alert or manually; timeline of events (alerts, deploys, notes, AI hypotheses); ack/assign/resolve → feeds MTTR.

---

## 15. Drill-down UX (dashboards are not dead ends)

`SRE ▸ Error rate ▸ Error Explorer ▸ service ▸ endpoint ▸ Logs ▸ pod ▸ Deployment ▸ Change`.
Implement as URL-addressable state (`?view=sre&drill=errors&service=api`) so every drill level is shareable/bookmarkable.

## 18. Real-time vs historical
Time-range switch: `live · 15m · 1h · 6h · 24h · 7d · 30d · custom`. Live = current incidents/CPU/latency/pods; historical = SLO trends, error budget, DORA, capacity. Same components, different query window + step.

---

## 19–20. AI/ML architecture + features

```
Prometheus/Logs/K8s/Deploys → feature pipeline (Python) → [Anomaly | Forecast | RCA] → results to Postgres → Node API → AI panels
```

**Node vs Python split:** Node = orchestration, API, storing results, serving to UI. Python (FastAPI) = all modeling/inference. Node calls Python over HTTP (you already proxy `/api/ml`).

Five concrete features (value-ordered):
1. **Anomaly detection** *(have baseline)* — z-score/rolling baseline → IsolationForest → seasonal. Inputs: CPU/mem/latency/error/traffic/restarts.
2. **Intelligent log analysis** *(have `loganalyzer.js`)* — cluster logs, counts, first-seen/peak/affected services/related deploy.
3. **AI root-cause (RCA)** — correlate metrics+logs+deploys+K8s events → **evidence-backed hypotheses** (always show the evidence, never a bare verdict).
4. **Incident early-warning** — risk signal + contributing signals + confidence (never "guaranteed future").
5. **Capacity forecasting** — disk/CPU/mem/traffic; e.g. `disk 68% → 84% in 30d → ~39d to threshold`.

---

## 16 (new). CHANGE IMPACT ANALYSIS — the differentiator

Answers: **what happened · what changed · what's affected · why · seen before.**

- Ingest change events → `change_events` table: `{type: commit|workflow|deploy|k8s|config, ref, actor, env, ts, meta}`. Sources: GitHub commits + Actions (webhook), deployment records, K8s change watches.
- On an anomaly/alert, build a **timeline** joining change_events + metric deltas + logs in a ±N-min window:
```
14:20 Deployment started (v2.4.1)
14:22 Deployment completed
14:23 API latency ↑ (180→640ms)
14:24 Error rate ↑ (0.2→4.1%)
14:25 Pods restarted ×3
14:26 DB timeout logs ↑ (×1,942)
→ Likely cause: deploy v2.4.1 (evidence: 3 signals within 6m)
```
- Backend: `src/deployments/` + `src/ai/change-impact`. Frontend: a **Change Impact** view + a "what changed?" panel on every incident.

---

## 21. Database schema (control-plane only)

```
organizations(id, name, slug, created_at)
users(id, email, name, password_hash, is_verified, ...)          # exists
memberships(id, org_id, user_id, role)                            # RBAC
environments(id, org_id, name)                                    # prod/staging/dev
integrations(id, org_id, env_id, type, config_encrypted, status)
data_sources(id, org_id, env_id, kind, url, creds_encrypted)
slos(id, org_id, service, sli, target, window)
alerts_config(id, org_id, env_id, name, expr, severity, channels)
alert_events(id, org_id, env_id, rule, severity, context_json, fired_at, resolved_at)
incidents(id, org_id, env_id, title, severity, status, opened_at, resolved_at, assignee_id)
incident_events(id, incident_id, kind, payload_json, ts)
deployments(id, org_id, env_id, service, version, status, started_at, finished_at, source)
pipeline_runs(id, org_id, provider, repo, workflow, status, duration_ms, started_at)   # GH+Jenkins normalized
change_events(id, org_id, env_id, type, ref, actor, meta_json, ts)                     # Change Impact
ai_insights(id, org_id, env_id, kind, subject, result_json, confidence, created_at)
reports(id, org_id, kind, payload_json, created_at)
audit_events(id, org_id, user_id, action, target, ts)
dashboards / dashboard_prefs(id, org_id, user_id, config_json)
```
Everything except `users` carries `org_id`. **Metrics/logs stay in Prometheus/Loki**, referenced by query, not copied.

---

## 22. Backend API (REST, all tenant-scoped)

```
POST /api/auth/{signup,login,verify,refresh,logout}   GET /api/auth/me
GET/POST /api/orgs   ·  /api/orgs/:id/members  ·  /api/orgs/:id/environments
GET/POST /api/integrations   ·  POST /api/integrations/:id/test
GET /api/metrics/query        # server-side Prometheus proxy (have: /api/prom)
GET /api/dashboards/{sre,devops,infra}   # composed, context-annotated payloads
GET/POST /api/alerts   ·  POST /api/webhooks/alertmanager
GET/POST /api/incidents  ·  POST /api/incidents/:id/{ack,resolve,note}
GET /api/deployments  ·  POST /api/webhooks/github
GET /api/change-impact?incident=…            # timeline join
POST /api/ai/{anomaly,forecast,rca}  ·  POST /api/logs/analyze   # have analyze
GET /api/reports  ·  GET /api/audit
```

## 23. Frontend structure
Group the existing `*View.jsx` under `dashboards/{sre,devops,infrastructure}/`; shared `components/`, `hooks/` (generalize `useTelemetry` → `usePromQuery`), `services/` (api client per domain), `lib/`. Add auth gate + org/env switchers in `Layout`.

---

## 24. Security checklist
Google OAuth (OIDC) · JWT access + httpOnly refresh · RBAC middleware · tenant row-scoping (+RLS later) · **credentials encrypted at rest**, never to browser · secrets via K8s Secret/SM/ESO · audit log · rate limiting (per-org) · input validation (zod) · signed webhooks (GitHub/Alertmanager) · no direct browser access to Prom/Grafana/K8s/DB · K8s RBAC least-privilege (you have namespaced RBAC).

---

## 25. Current → target migration map (safe order)

1. `auth.js` → `auth/` + add `organizations`, `memberships`, `environments` tables + middleware. (unblocks everything)
2. Split `app.js` routes into `src/{routes,integrations,...}`; app factory.
3. Regroup frontend views → `dashboards/{sre,devops,infra}`; add auth gate + org/env switcher.
4. `integrations/prometheus` adapter (wrap `/api/prom`); `usePromQuery` hook.
5. `deployments` + GitHub webhook → DORA on DevOps dashboard.
6. `alerts`+`incidents` tables + Alertmanager webhook.
7. `change_events` + Change Impact view.
8. Split `ai/ml` into `anomaly/forecasting/rca`; RCA + forecasting endpoints.

Each step ships independently; app stays green.

---

## 29–30. Roadmap & priorities

**P0 (foundation, build now):** Google OAuth + orgs/memberships/RBAC + tenant scoping; auth-gated SPA with org/env switcher; Prometheus integration adapter + `usePromQuery`; SRE dashboard v1 with context tiles.

**P1 (differentiate):** DevOps/DORA dashboard + GitHub webhook + `deployments`; Infra dashboard (reuse existing K8s PromQL); Alerts+Incidents + Alertmanager; **Change Impact v1**.

**P2 (intelligence & scale):** RCA + forecasting + early-warning; Loki for logs; Grafana embed for deep dashboards; Slack/webhook notifications; billing; RLS; horizontal scaling.

---

## 31–33. Testing / scalability / prod-readiness (brief)
- **Testing:** keep jest (backend) + pytest (ML); add supertest for auth/RBAC + tenant-isolation tests (a Viewer of Org A must never read Org B); Playwright smoke for the login→dashboard journey.
- **Scale:** Node is stateless → scale by replicas behind the LB (HPA exists); Prometheus does the heavy time-series lifting; Postgres for control state (add read replica later); cache composed dashboard payloads briefly.
- **Prod-readiness:** OAuth + RBAC + tenant isolation tested · secrets not in git · Alertmanager wired · backups on RDS · dashboards have SLOs · runbook in `docs/` · CI green · image scanning (Trivy, have) · health/readiness (have).

---

## Technology decisions — what NOT to add (yet)

| Tempting tech | Verdict | Why |
|---|---|---|
| Kafka / event bus | **Later** | Webhooks + Postgres suffice at current scale; add when ingestion > single node |
| Loki | **P2** | Ring buffer + log-analyze works now; add when you need real log retention/search |
| Service mesh (Istio) | **No** | Overkill; adds ops burden with no current payoff |
| Separate Grafana | **Optional** | Your React dashboards cover product UX; Grafana only for power-user deep dives |
| GraphQL | **No** | REST is fine and simpler for this domain |
| A second DB | **No** | Postgres covers control-plane; Prometheus covers metrics |

**Rule:** introduce a technology only when a named problem in this doc demands it.
