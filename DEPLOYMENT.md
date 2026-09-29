# Deployment Report — build-and-deploy

**Status:** ✅ Successfully deployed to AWS, verified end-to-end, then torn down to stop billing.
**Date:** 2026-09-28 · **Region:** eu-north-1 · **Account:** 135438495833

A stateful REST API (Express + PostgreSQL) was built from source, shipped through
a GitHub Actions CI/CD pipeline to Amazon EKS, backed by Amazon RDS, exposed to
the public internet, and monitored with Prometheus + Grafana — the full lifecycle
from empty account to live service and back to zero.

---

## 1. What was deployed

```
Internet
   │  http://<node-ip>:30080 (app)      http://<node-ip>:30300 (Grafana)
   ▼
NodePort (node security group opened)
   ▼
┌─────────────────────────── Amazon EKS 1.32 (eu-north-1) ───────────────────────────┐
│  namespace: production-app                     namespace: monitoring                │
│  ┌────────────────────────┐                    ┌───────────────┐  ┌──────────────┐ │
│  │ devops-app  (2 pods)    │  /metrics scrape   │  Prometheus   │  │   Grafana    │ │
│  │ Express + pg + metrics  │◄───────────────────│  (pod SD)     │─►│  dashboard   │ │
│  └───────────┬─────────────┘                    └───────────────┘  └──────────────┘ │
│              │ db-migrate Job (ran once, Completed)                                  │
└──────────────┼──────────────────────────────────────────────────────────────────────┘
               │ 5432 (TLS, VPC-internal, SG-restricted)
               ▼
        Amazon RDS PostgreSQL 16.9  (db.t4g.micro, encrypted)
```

---

## 2. Verified live (proof)

All checks executed against the public node IP over the internet:

| Test | Result |
|------|--------|
| `GET /` | `200` — `{"status":"healthy","service":"devops-app","version":"2.0.0",...}` |
| `GET /health` (liveness) | `200` |
| `GET /ready` (checks DB) | `200` — `{"status":"ready","database":"connected"}` |
| `POST /api/tasks` | `201` — created task `id:1`, **persisted to RDS** |
| `GET /api/tasks` | `200` — read back `{"items":[{"id":1,...}],"count":1}` |
| `GET /metrics` | `200` — Prometheus metrics (`http_requests_total`, latency histogram, Node.js runtime) |
| DB migration Job | **Completed** — schema applied via `scripts/migrate.js` |
| App pods | `2/2 Running` (both `1/1` Ready) |
| Grafana | `200` on `/login`, dashboard provisioned |
| Prometheus | `Running`, scraping app pods via `prometheus.io/*` annotations |

Example — a task written through the public endpoint into PostgreSQL:

```json
POST /api/tasks  {"title":"first live task","status":"pending"}
201 → {"id":1,"title":"first live task","status":"pending",
       "created_at":"2026-09-28T11:32:28.132Z","updated_at":"2026-09-28T11:32:28.132Z"}
```

Structured JSON logs confirmed the request path (`kubectl logs`):

```json
{"level":"info","service":"devops-app","version":"2.0.0","pod":"devops-app-74d97896bb-jqzm7",
 "req":{"method":"POST","url":"/api/tasks"},"res":{"statusCode":201},"responseTime":10,"msg":"request completed"}
```

---

## 3. AWS resources provisioned

| Resource | Detail |
|----------|--------|
| EKS cluster | `build-and-deploy`, Kubernetes 1.32, managed nodegroup |
| Worker nodes | 4× `t3.micro` (scaled from 2 for pod-capacity headroom) |
| RDS | PostgreSQL 16.9, `db.t4g.micro`, encrypted, in the EKS VPC, SG-restricted to `192.168.0.0/16` |
| Networking | VPC `192.168.0.0/16`, public + private subnets across 3 AZs |
| IAM (CI) | GitHub Actions **OIDC provider** + `github-actions-deploy` role (no static keys) |
| EKS access | Access entry mapping the CI role, `AmazonEKSAdminPolicy` scoped to `production-app` |
| Secrets Manager | `build-and-deploy/db-credentials` (created by Terraform) |
| Container image | `ghcr.io/m-anishh/build-and-deploy:latest` (built + pushed by CI) |

---

## 4. CI/CD pipeline result

Triggered by merge of PR #5 to `main`:

| Job | Result |
|-----|--------|
| Test & Lint | ✅ 17 tests, eslint clean |
| Security Scan | ✅ Trivy + `npm audit` |
| Build & Push (GHCR) | ✅ multi-stage image pushed |
| Run DB migrations (Job) | ✅ Completed before rollout |
| Deploy to Kubernetes | ✅ rollout succeeded (2 replicas, zero-downtime) |

Authentication used **GitHub OIDC** (federated, no long-lived AWS keys).

---

## 5. Problems solved during deployment

Real issues hit on an **AWS Free Plan** account and how each was fixed:

| Problem | Root cause | Fix |
|---------|-----------|-----|
| Terraform `No valid credential sources` | creds came from `aws login` (custom session store) | `eval "$(aws configure export-credentials --format env)"` before apply |
| RDS `FreeTierRestrictionError` | backup retention 7d > free-tier cap | `backup_retention_days=1`, Performance Insights off, no storage autoscaling |
| RDS `Cannot find version 16.4` | engine version not offered | switched to `16.9` (from `describe-db-engine-versions`) |
| App/migration pods stuck `Pending` | `t3.micro` caps at **4 pods/node** (ENI limit) | freed system slots (removed metrics-server, coredns→1) **and scaled nodegroup to 4 nodes**; proper long-term fix = VPC-CNI prefix delegation at `maxPodsPerNode: 110` |
| Two databases billing | a stray Aurora cluster was created manually | deleted the Aurora cluster |
| First pipeline run failed at migrations | pods couldn't schedule (capacity) + placeholder DB_HOST | fixed capacity + set real RDS endpoint in configmap, re-ran |

---

## 6. Public exposure

Free path (no paid load balancer):

- `NodePort` Services — app on `30080`, Grafana on `30300`
- Node security group opened for those ports
- Reached at `http://<node-external-ip>:<port>`

> Node IPs change if a node is replaced. Production-grade alternative: ALB Ingress
> or a LoadBalancer Service (adds a paid ELB), optionally with a domain + TLS.

---

## 7. Teardown (billing stopped)

After verification, all costly AWS resources were destroyed:

| Resource | State |
|----------|-------|
| EKS cluster + 6 nodes (lifetime) | ✅ deleted |
| RDS PostgreSQL | ✅ deleted |
| Aurora cluster | ✅ deleted |
| VPC / subnets / SGs / NAT | ✅ deleted |
| IAM role + OIDC provider | ✅ deleted |
| Secrets Manager secret | ✅ deleted |

GitHub repository, workflow, PR history, and container image were intentionally
**kept**. Two unrelated personal EC2 instances were left untouched.

**Result: AWS hourly billing = $0.** Redeploy anytime via the runbook in
[README.md](README.md#live-deployment-runbook-aws-from-zero).

---

## 8. Tech stack

Node.js / Express · PostgreSQL (Amazon RDS) · Docker (multi-stage, non-root) ·
Kubernetes (Amazon EKS) · Terraform · Prometheus + Grafana · pino (structured logs)
· GitHub Actions (OIDC) · Python (load/smoke testing)
