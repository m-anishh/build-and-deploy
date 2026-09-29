# manishOps — Project Report

> A full-stack, cloud-native **DevOps/SRE observability platform**: React dashboard, Node API, PostgreSQL, a Python ML service, Prometheus-based monitoring, containerized and deployed to **AWS EKS** through a CI/CD pipeline — with authentication and a live public URL.
>
> Written for: engineers and reviewers evaluating this project.
> Repo: `github.com/m-anishh/build-and-deploy` · branch `feat/manishops-observability-platform`

---

## 1. What it is

manishOps is an observability & operations platform that moves an engineer through **collect → contextualize → detect → explain → alert → drill down → respond → learn**. It combines application telemetry, Kubernetes/infra metrics, logs, alerts, and AI anomaly/log analysis behind one authenticated SaaS-style UI.

**Live (AWS EKS):** `http://aee2f6b6baa794c84bc4e00f7cfc6d51-c1aa0eb14c08a56d.elb.eu-north-1.amazonaws.com`
*(Public NLB; billable — see Teardown.)*

---

## 2. Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, Recharts, lucide-react |
| Backend | Node.js + Express (pino logging, prom-client) |
| ML | Python + FastAPI + scikit-learn (IsolationForest) |
| Database | PostgreSQL (Amazon RDS) |
| Auth | JWT + bcrypt, email verification (Google OAuth planned) |
| Monitoring | Prometheus + Grafana + exporters (kube-state-metrics, node-exporter) |
| Containers | Docker (multi-stage) |
| Orchestration | Kubernetes (Amazon EKS 1.32) |
| Registry | Amazon ECR |
| IaC | Terraform (RDS), eksctl (cluster) |
| CI/CD | GitHub Actions (OIDC to AWS, Trivy scan) |

---

## 3. Repository structure

```
frontend/          React + Vite SPA (the manishOps UI)
  src/
    App.jsx                     auth gate + view router
    components/                 Layout (icon rail), 20+ views, charts, auth
    hooks/useTelemetry.js       live metrics polling + rate computation
    lib/prom.js                 Prometheus text parser
    api.js                      API client (token handling)
backend/           Node/Express control plane (serves the built UI too)
  app.js                        wiring, routes, proxies (/api/ml, /api/prom)
  src/
    auth.js                     signup/login/verify/JWT + middleware
    db.js  logger.js  metrics.js
    loganalyzer.js              log clustering + K8s issue detection
    routes/tasks.js             CRUD resource
  scripts/migrate.js            idempotent migration runner
  __tests__/                    jest + supertest (17 tests)
database/
  migrations/                   001_init (tasks), 002_users
ai/ml/             Python FastAPI anomaly-detection service
  app/{main,model,schemas}.py   IsolationForest + /predict /train /metrics
  tests/test_api.py             pytest (4 tests)
monitoring/        Prometheus, Grafana, exporters, K8s dashboards
k8s/               namespace, rbac, configmap, secret, deployment(s),
                   services, HPA, migration Job, public NLB
infra/             eks-cluster.yaml (eksctl) + terraform/ (RDS)
scripts/loadtest.py            Python load/smoke tester
docs/              ARCHITECTURE.md (product spec) + this report
deploy-all.sh                  one-shot EKS deploy (build→ECR→apply→NLB)
docker-compose.yml             local stack (app + postgres + ml)
.github/workflows/             CI/CD pipeline
```

---

## 4. Features (all functional)

**UI pages (icon rail, light professional theme):**
- **Home** — KPI tiles + quick links
- **Metrics** — live request rate, latency, status-code, per-route traffic, task donut, memory (from the app's own `/metrics`)
- **Kubernetes** — namespace CPU/memory/storage panels (PromQL via backend proxy)
- **Prometheus** — infra panels (node CPU/mem/disk/net/load) against a Prometheus datasource
- **Logs** — live structured log stream (backend ring buffer)
- **Log Analysis** — paste/upload `kubectl logs` → clusters messages, detects OOMKilled/CrashLoop/probe failures/timeouts, error timeline, verdict
- **Alerts** — live rules over telemetry + ML (error rate, latency, memory, DB, anomaly)
- **Reports** — live health report + JSON export
- **Data sources** — live status of Postgres / Prometheus / ML
- **Pipelines** — CI/CD stage view
- **Dashboards** — hub linking the above
- **Tasks** — CRUD board (RDS-backed)
- **AI / Anomaly** — ML verdict + "train on live data"
- **Auth** — split-screen Sign In / Sign Up with email verification, gating the app

**AI/ML:** IsolationForest anomaly detection (bootstrap + retrain on live data); rule-based log analysis with K8s failure-signature detection.

---

## 5. Backend API (selected)

```
Auth:     POST /api/auth/signup | /login   GET /api/auth/verify | /me
App:      GET /api/info  /health  /ready  /metrics
Tasks:    GET/POST/PUT/DELETE /api/tasks
Logs:     GET /api/logs        POST /api/logs/analyze
Proxies:  * /api/ml/*   (→ Python ML service)
          GET /api/prom/*  (→ Prometheus HTTP API, server-side creds)
```
The browser never talks to Prometheus/ML/DB directly — the Node plane proxies with server-held config.

---

## 6. Database

PostgreSQL on Amazon RDS (`devops-app-postgres`, eu-north-1, Postgres 18, TLS).
Migrations (idempotent, tracked in `schema_migrations`):
- `001_init.sql` — `tasks` (id, title, description, status, timestamps)
- `002_users.sql` — `users` (email, password_hash, is_verified, verify_token, …)

Connection via discrete `DB_*` env or `DATABASE_URL`; pooled with `pg`.

---

## 7. DevOps & deployment

**Local:** `docker compose up --build` (app + postgres + ml), or per-service dev.

**AWS (what's deployed):**
- **RDS** PostgreSQL (Terraform-describable; provisioned live), SG scoped to cluster node IPs.
- **ECR** repos `manishops-backend`, `manishops-ml` (scan-on-push).
- **EKS** cluster `build-and-deploy` (1.32), managed t3.micro nodegroup (scaled to 4 for pod capacity).
- **K8s**: namespace, RBAC, ConfigMap, Secret (DB creds + JWT), ML Deployment/Service, DB migration Job, app Deployment/Service, **public NLB**.
- **[deploy-all.sh](../deploy-all.sh)** performs the whole flow detached: ECR login → build backend+ml → push → apply manifests → run migration → roll out → print public URL.

**CI/CD** ([.github/workflows](../.github/workflows/github-actions-ci-cd.yml)): test+lint → Trivy security scan → build/push image → OIDC deploy to EKS → auto-rollback → notify. No long-lived AWS keys (GitHub OIDC).

---

## 8. Testing

- **Backend:** 17 jest/supertest tests (endpoints, tasks CRUD, error paths). `cd backend && npm test`.
- **ML:** 4 pytest tests (health, predict normal-vs-extreme, train). `cd ai/ml && pytest`.
- **Smoke/load:** `python3 scripts/loadtest.py --smoke | --requests N`.
- **Security:** Trivy filesystem scan + `npm audit` in CI.

---

## 9. Security

JWT (bcrypt-hashed passwords) + email verification · tenant-scoped design (see ARCHITECTURE.md) · secrets in K8s Secret / not in git (`.env`, tfstate, `.mcp.json` gitignored) · non-root containers, read-only rootfs, dropped capabilities, seccomp · namespaced K8s RBAC · GitHub OIDC (no static cloud keys) · browser never reaches Prometheus/ML/DB directly.

---

## 10. Architecture at a glance

```
Browser (React, JWT)
      │
Node/Express control plane ── serves UI, authN/Z, proxies
   ├── PostgreSQL (RDS)        control-plane state (users, tasks)
   ├── Python ML (FastAPI)     anomaly detection
   └── Prometheus HTTP API     metrics (source of truth)
```
Full product/target spec: **[ARCHITECTURE.md](ARCHITECTURE.md)** (multi-tenant SaaS, RBAC, SRE/DevOps/Infra dashboards, DORA, alerting/incidents, Change-Impact, AI roadmap, migration map, P0/P1/P2).

---

## 11. How to run

**Local (Docker):**
```bash
docker compose up --build
docker compose run --rm app node scripts/migrate.js
# http://localhost:3000
```

**Local (per service):**
```bash
cd frontend && npm i && npm run build          # or npm run dev (Vite :5173)
cd ../ai/ml && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --port 8000
cd ../../backend && npm i && cp .env.example .env   # set DB_*
npm run migrate && npm start                    # serves UI + API on :3000
```

**Deploy to EKS:** `./deploy-all.sh` (requires AWS creds + a cluster).

---

## 12. Cost & teardown

Running on AWS bills continuously (EKS control plane + 4× t3.micro + NLB + RDS ≈ ~$120/mo).

```bash
kubectl delete -f k8s/k8s-service-lb.yaml
eksctl delete cluster --name build-and-deploy --region eu-north-1
aws rds delete-db-instance --db-instance-identifier devops-app-postgres \
  --skip-final-snapshot --region eu-north-1
```

---

## 13. Status summary

| Area | Status |
|------|--------|
| Frontend (20+ pages, auth-gated) | ✅ |
| Backend API + proxies + tests | ✅ (17 tests) |
| PostgreSQL + migrations | ✅ (RDS) |
| ML anomaly service + tests | ✅ (4 tests) |
| Auth (signup/verify/login/JWT) | ✅ |
| Docker + docker-compose | ✅ |
| Kubernetes manifests | ✅ |
| Monitoring (Prometheus/Grafana/exporters) | ✅ config |
| CI/CD (GitHub Actions + OIDC) | ✅ |
| Terraform (RDS) | ✅ |
| **Deployed to EKS + public URL** | ✅ live |
| Architecture/product spec | ✅ docs/ARCHITECTURE.md |

Roadmap (next): Google OAuth + multi-tenant orgs/RBAC, SRE/DevOps/Infra segmented dashboards with SLO context, DORA via GitHub webhook, Alertmanager + incidents, Change-Impact analysis, ML RCA + forecasting. See ARCHITECTURE.md §29 for P0/P1/P2.
```
