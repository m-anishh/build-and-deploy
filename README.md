# Build-and-deploy — Production-ready DevOps project

![CI/CD](https://github.com/m-anishh/build-and-deploy/actions/workflows/github-actions-ci-cd.yml/badge.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-EKS%201.32-326CE5?logo=kubernetes&logoColor=white)
![Terraform](https://img.shields.io/badge/IaC-Terraform-7B42BC?logo=terraform&logoColor=white)
![Prometheus](https://img.shields.io/badge/metrics-Prometheus-E6522C?logo=prometheus&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

A **stateful REST API** (Express + **PostgreSQL/RDS**) shipped through a full
CI/CD pipeline to **Amazon EKS**, with **Prometheus metrics**, **structured
logging**, and a **Grafana dashboard**. GitHub Actions builds and scans the
code, pushes a Docker image to GHCR, runs database migrations, and deploys to
Kubernetes with an automatic rollback on failure. Authentication to AWS uses
**GitHub OIDC** — no long-lived keys stored anywhere.

**Stack:** Node.js/Express · PostgreSQL (Amazon RDS) · Docker · Kubernetes (EKS)
· Terraform · Prometheus + Grafana · GitHub Actions · Python (load testing)

- **Repo:** `m-anishh/build-and-deploy`
- **AWS account:** `135438495833` · **Region:** `eu-north-1`
- **Cluster:** `build-and-deploy` (EKS 1.32) · **Namespace:** `production-app`
- **Image:** `ghcr.io/m-anishh/build-and-deploy:latest`

---

## Table of contents

- [Architecture](#architecture)
- [Application](#application)
- [Docker](#docker)
- [Database & migrations](#database--migrations)
- [Observability](#observability)
- [CI/CD pipeline](#cicd-pipeline)
- [Infrastructure (EKS)](#infrastructure-eks)
- [Kubernetes manifests](#kubernetes-manifests)
- [Deploy, verify, rollback](#deploy-verify-rollback)
- [Teardown (stop all billing)](#teardown-stop-all-billing)
- [Troubleshooting](#troubleshooting)
- [Repo layout](#repo-layout)

---
## Architecture

```
 push to main
      │
      ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐
│  Test & Lint │   │Security Scan │   │ Build & Push (GHCR)  │
│  jest + esl. │   │ Trivy + audit│   │ docker buildx        │
└──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘
       └───────── needs ──┴──── needs ───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐   deploy fails
                     │ Deploy to Kubernetes  │──────────────┐
                     │ OIDC → kubectl apply  │              ▼
                     └───────────┬───────────┘   ┌─────────────────────┐
                          success│               │ Rollback (undo)     │
                                 ▼               └──────────┬──────────┘
                          ┌────────────┐                    │
                          │Notification│◄───────────────────┘
                          │  (Slack)   │
                          └────────────┘
```

The app runs as a Kubernetes **Deployment** (2 replicas) behind a **ClusterIP
Service**, with a **ServiceAccount + RBAC**, **ConfigMap**, and **HPA**.

---

## Application

Modular Express server ([app.js](app.js) + [src/](src/)) — a JSON API backed by
PostgreSQL.

| Method | Path                | Purpose                                        |
|--------|---------------------|------------------------------------------------|
| GET    | `/`                 | Root info (status, version, uptime)            |
| GET    | `/health`           | Liveness + startup probe                        |
| GET    | `/ready`            | Readiness probe — checks DB (503 while draining)|
| GET    | `/metrics`          | Prometheus metrics                              |
| GET    | `/api/hello?name=`  | Greeting (demo)                                 |
| GET    | `/api/tasks`        | List tasks (`?status=&limit=&offset=`)          |
| POST   | `/api/tasks`        | Create task (`{title, description?, status?}`)  |
| GET    | `/api/tasks/:id`    | Get one task (404 if missing)                   |
| PUT    | `/api/tasks/:id`    | Update task (partial; 404 if missing)           |
| DELETE | `/api/tasks/:id`    | Delete task (204; 404 if missing)               |

`tasks` are persisted in PostgreSQL. When no database is configured the app
still boots in **stateless mode** (health checks pass; DB routes return 503) —
so tests and non-DB endpoints keep working.

Graceful shutdown on `SIGTERM`/`SIGINT`: flips readiness to 503, drains, closes
the DB pool, then exits — so Kubernetes stops routing traffic before the pod dies.

### Source layout ([src/](src/))

| File | Responsibility |
|------|----------------|
| `src/db.js` | PostgreSQL connection pool, `query`/`ping`/`close`, SSL for RDS |
| `src/logger.js` | Structured JSON logging (pino) |
| `src/metrics.js` | Prometheus registry, request middleware, `/metrics` handler |
| `src/routes/tasks.js` | CRUD routes + validation for the `tasks` resource |

### Local development

Fastest path — the whole stack (app + Postgres) via Docker Compose:

```bash
docker compose up --build                       # app on :3000, postgres on :5432
docker compose run --rm app node scripts/migrate.js   # run migrations
curl localhost:3000/ready                        # {"status":"ready","database":"connected"}
python3 scripts/loadtest.py --smoke              # exercise every endpoint
```

Or run the app directly against a local/remote Postgres:

```bash
npm ci
cp .env.example .env        # then edit DB_* values
npm run migrate             # apply migrations
npm run dev                 # NODE_ENV=development, port 3000
npm test                    # jest + coverage (pretest runs eslint)
```

---

## Docker

Multi-stage [Dockerfile](Dockerfile): deps built in a `builder` stage, runtime
image runs as **non-root** (uid 1001), with a `HEALTHCHECK` hitting `/health`.

```bash
docker build -t devops-app:local .
docker run -p 3000:3000 devops-app:local
```

---

## Database & migrations

The app uses **PostgreSQL** (Amazon RDS in production, a container locally). It
connects via either `DATABASE_URL` or discrete `DB_HOST/DB_PORT/DB_NAME/DB_USER/
DB_PASSWORD` vars (the latter maps cleanly to a K8s ConfigMap + Secret). TLS is
enabled automatically in production.

Schema lives in [migrations/](migrations/) as ordered `*.sql` files. A small
dependency-free runner ([scripts/migrate.js](scripts/migrate.js)) applies each
file exactly once, tracked in a `schema_migrations` table (idempotent, safe to
re-run):

```bash
npm run migrate          # local
```

In the cluster, migrations run as a Kubernetes **Job**
([k8s/k8s-migration-job.yaml](k8s/k8s-migration-job.yaml)) that CI applies and
waits on **before** the Deployment rolls out — so schema always matches the code.

Current schema: a `tasks` table (`id, title, description, status, created_at,
updated_at`) with a `status` check constraint and indexes on `status` and
`created_at`.

---

## Observability

- **Metrics** — [src/metrics.js](src/metrics.js) exposes Prometheus metrics at
  `GET /metrics`: `http_requests_total`, `http_request_duration_seconds`
  (histogram, for p95/p99), plus default Node.js process/GC/event-loop metrics.
  The Deployment's `prometheus.io/*` annotations make pods auto-discoverable.
- **Logging** — [src/logger.js](src/logger.js) emits structured JSON (pino) with
  request logging via `pino-http`, ready for Loki / CloudWatch / Fluent Bit.
- **Dashboards** — [monitoring/](monitoring/) ships a self-contained Prometheus
  + Grafana quickstart and a pre-built dashboard.

```bash
# deploy the monitoring stack (namespace: monitoring)
kubectl apply -f monitoring/prometheus.yaml
kubectl apply -f monitoring/grafana.yaml
# load the dashboard JSON into the ConfigMap Grafana reads
kubectl create configmap grafana-dashboards -n monitoring \
  --from-file=devops-app.json=monitoring/grafana-dashboard.json \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl port-forward -n monitoring svc/grafana 3001:3000    # http://localhost:3001 (admin/admin)
```

> For production, prefer the `kube-prometheus-stack` Helm chart; the manifests
> here are a lightweight, no-Helm quickstart.

Generate traffic to populate the dashboards:

```bash
python3 scripts/loadtest.py --url http://localhost:3000 --requests 500 --concurrency 20
```

---

## CI/CD pipeline

Defined in [.github/workflows/github-actions-ci-cd.yml](.github/workflows/github-actions-ci-cd.yml).
Triggers on push / PR to `main` and `develop`.

| Job | Runs | Notes |
|-----|------|-------|
| **Test & Lint** | always | `npm ci`, `npm test`, uploads coverage |
| **Security Scan** | always | Trivy (fs, CRITICAL/HIGH) + `npm audit` |
| **Build & Push** | push only | buildx → GHCR, tags `latest` + `sha`, gha cache |
| **Deploy to Kubernetes** | push to `main` | OIDC → `update-kubeconfig` → migration Job → `kubectl apply` |
| **Rollback** | only if Deploy fails | `kubectl rollout undo` |
| **Notification** | always | Slack via `SLACK_WEBHOOK` (best-effort) |

### AWS authentication — GitHub OIDC (no stored keys)

The deploy and rollback jobs assume an IAM role via OIDC; nothing secret is
stored in GitHub.

- **OIDC provider:** `token.actions.githubusercontent.com` (in IAM)
- **Role:** `github-actions-deploy`
  - **Trust** — only this repo, only these subjects:
    - `repo:m-anishh/build-and-deploy:environment:production` (deploy job)
    - `repo:m-anishh/build-and-deploy:ref:refs/heads/main` (rollback job)
  - **Permissions** — minimal: `eks:DescribeCluster` only.
- **EKS access entry** — role mapped to the cluster with
  `AmazonEKSAdminPolicy` **scoped to the `production-app` namespace** (not
  cluster-wide). This is what gives kubectl its RBAC; IAM alone is not enough.

Each job sets `permissions: id-token: write` (required for OIDC). The deploy job
also sets `packages: read` so `GITHUB_TOKEN` can mint the GHCR pull secret.

> Because the deploy job runs in the `production` GitHub Environment, its OIDC
> subject is `...:environment:production`, **not** a git ref. The rollback job
> has no environment, so its subject is `...:ref:refs/heads/main`. Both are
> allowed in the trust policy — miss either and you get `Not authorized to
> perform sts:AssumeRoleWithWebIdentity`.

### Required GitHub config

- **Environment** `production` (Settings → Environments).
- **Secret** `SLACK_WEBHOOK` — optional; notifications are best-effort.
- **No AWS secrets needed** (OIDC). `KUBE_CONFIG` from earlier versions is unused.

---

## Infrastructure (EKS)

Cluster is defined in [infra/eks-cluster.yaml](infra/eks-cluster.yaml) (eksctl
`ClusterConfig`).

```bash
eksctl create cluster -f infra/eks-cluster.yaml     # ~15–20 min
```

- **Nodes:** 2 × `t3.micro`, public subnets (`privateNetworking: false`).
- **Version:** 1.32.

### Why t3.micro + 2 replicas (Free-Plan constraints)

This account is on the **AWS Free Plan**, which blocks non-free-tier instance
types — `t3.medium` fails with *"not eligible for Free Tier."* So nodes are
`t3.micro`.

`t3.micro` caps at **4 pods/node** (ENI limit) → 8 pod slots total. Six are
taken by system pods (`aws-node`×2, `kube-proxy`×2, `coredns`×2), leaving room
for exactly **2 app pods**. Hence `replicas: 2` and HPA `minReplicas: 2`.

> **HPA is inert here:** `metrics-server` doesn't fit in the remaining slots, so
> the HPA shows `<unknown>` targets and never scales. To make autoscaling work,
> enable **VPC-CNI prefix delegation** (raises max-pods to ~110, free, needs a
> node recycle) or use larger nodes.

### Cost notes

- EKS control plane bills **~$0.10/hr** whenever the cluster exists.
- eksctl creates a **NAT gateway** by default (~$0.045/hr + EIP). With public
  nodes it's unused — this project deletes it to save ~$36/mo.
- NodePort exposure (below) is free; a LoadBalancer Service would add a paid ELB.

### Database (RDS) — Terraform

PostgreSQL is provisioned with Terraform in [infra/terraform/](infra/terraform/):
an RDS instance (encrypted, gp3, Performance Insights) in the EKS VPC, a security
group allowing 5432 only from the cluster CIDR, a DB subnet group, and a Secrets
Manager secret holding the credentials.

```bash
cd infra/terraform
terraform init
terraform apply \
  -var="vpc_id=vpc-xxxx" \
  -var='subnet_ids=["subnet-a","subnet-b"]' \
  -var="allowed_cidr=10.0.0.0/16" \
  -var="db_password=$(openssl rand -base64 24)"

terraform output kubectl_create_secret_hint   # how to create the K8s secret
```

Then point `DB_HOST` in `k8s-configmap.yaml` at the `db_endpoint` output and
create the `db-credentials` Secret from the Terraform outputs (or wire up the
External Secrets Operator against the Secrets Manager ARN).

> Defaults to `db.t4g.micro` (free-tier eligible) with `deletion_protection` on.

---

## Kubernetes manifests

In [k8s/](k8s/), applied in this order by the deploy job:

| File | Resource | Notes |
|------|----------|-------|
| `k8s-namespace.yaml` | Namespace `production-app` | **Pre-created out-of-band** — the namespace-scoped CI role can't create a cluster-scoped Namespace |
| `k8s-rbac.yaml` | ServiceAccount + Role + RoleBinding | app reads pods/configmaps/secrets in-namespace |
| `k8s-configmap.yaml` | ConfigMap `app-config` | app env + non-secret DB config (`DB_HOST` etc.) |
| `k8s-secret.yaml` | Secret `db-credentials` | **Template** — DB user/password; create out-of-band in prod |
| `k8s-migration-job.yaml` | Job `db-migrate` | runs `scripts/migrate.js` before rollout |
| `k8s-deployment.yaml` | Deployment (2 replicas) | non-root, probes, DB env, RollingUpdate `maxUnavailable: 0` |
| `k8s-service.yaml` | ClusterIP Services | app (80→http) + metrics (3000) |
| `k8s-hpa.yaml` | HPA (min 2, max 10) | inert without metrics-server (see above) |

The deploy job rewrites the image placeholder to
`ghcr.io/m-anishh/build-and-deploy:latest` (forced lowercase — GHCR rejects the
uppercase repo name) and creates a `ghcr-pull` docker-registry secret from
`GITHUB_TOKEN`, patched onto the `devops-app` ServiceAccount so nodes can pull
the private image.

### One-time setup outside CI

```bash
# namespace + RBAC (CI role is namespace-scoped, can't create the namespace)
kubectl apply -f k8s/k8s-namespace.yaml
kubectl apply -f k8s/k8s-rbac.yaml

# DB credentials secret (do NOT commit real values — use Terraform output / ESO)
kubectl create secret generic db-credentials -n production-app \
  --from-literal=DB_USER=appuser \
  --from-literal=DB_PASSWORD='<from-secrets-manager>'
```

---

## Deploy, verify, rollback

### Manual deploy (mirrors CI)

```bash
aws eks update-kubeconfig --name build-and-deploy --region eu-north-1
kubectl apply -f k8s/k8s-configmap.yaml
kubectl apply -f k8s/k8s-migration-job.yaml           # run migrations first
kubectl wait --for=condition=complete job/db-migrate -n production-app --timeout=180s
kubectl apply -f k8s/k8s-deployment.yaml
kubectl apply -f k8s/k8s-service.yaml
kubectl apply -f k8s/k8s-hpa.yaml
kubectl rollout status deployment/devops-app -n production-app
```

### Verify

```bash
kubectl get deploy,pods,svc,hpa -n production-app
kubectl port-forward -n production-app svc/devops-app 8080:80 &
curl localhost:8080/health
```

### Rollback (what the CI rollback job runs)

```bash
kubectl rollout undo deployment/devops-app -n production-app
kubectl rollout status deployment/devops-app -n production-app
```

`maxUnavailable: 0` keeps the running pods serving during a failed deploy, so
rollback is zero-downtime.

---

## Expose publicly (optional, free NodePort)

ClusterIP is internal only. For a quick public URL without a paid LoadBalancer:

```bash
# NodePort service on 30080 (separate from the CI-managed ClusterIP svc)
kubectl apply -f - <<'YAML'
apiVersion: v1
kind: Service
metadata: { name: devops-app-public, namespace: production-app }
spec:
  type: NodePort
  selector: { app: devops-app }
  ports: [{ name: http, port: 80, targetPort: http, nodePort: 30080 }]
YAML

# open the port on the node security group (0.0.0.0/0 = whole internet — restrict in real use)
SG=$(aws ec2 describe-instances --region eu-north-1 \
  --filters Name=tag:eks:cluster-name,Values=build-and-deploy \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress --region eu-north-1 \
  --group-id "$SG" --protocol tcp --port 30080 --cidr 0.0.0.0/0

# node public IP → open http://<node-ip>:30080/
kubectl get nodes -o jsonpath='{range .items[*]}{.status.addresses[?(@.type=="ExternalIP")].address}{"\n"}{end}'
```

Node IPs change if a node is replaced. For a stable URL, use a LoadBalancer
Service (adds a paid ELB) or an Ingress controller.

Close it when done:

```bash
aws ec2 revoke-security-group-ingress --region eu-north-1 \
  --group-id "$SG" --protocol tcp --port 30080 --cidr 0.0.0.0/0
kubectl delete svc devops-app-public -n production-app
```

---

## Live deployment runbook (AWS, from zero)

This is the exact end-to-end sequence used to stand the project up on a fresh
account (everything torn down), plus the real gotchas hit on an **AWS Free Plan**.

### 1. Cluster + CI identity

```bash
# EKS cluster (~20 min; eksctl also installs metrics-server as an addon)
eksctl create cluster -f infra/eks-cluster.yaml

# GitHub Actions OIDC provider + deploy role (account-level, no keys)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
aws iam create-role --role-name github-actions-deploy \
  --assume-role-policy-document file://trust.json           # sub: repo env:production + ref:main
aws iam put-role-policy --role-name github-actions-deploy \
  --policy-name eks-describe --policy-document file://perm.json   # eks:DescribeCluster

# Map the role into the cluster, scoped to the app namespace
aws eks create-access-entry  --cluster-name build-and-deploy --principal-arn <role-arn> --type STANDARD
aws eks associate-access-policy --cluster-name build-and-deploy --principal-arn <role-arn> \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy \
  --access-scope type=namespace,namespaces=production-app
```

### 2. Database (RDS) via Terraform

```bash
cd infra/terraform && terraform init
# aws login stores creds in a way Terraform's SDK can't read -> export them:
eval "$(aws configure export-credentials --format env)"
terraform apply \
  -var="vpc_id=<eks-vpc>" -var='subnet_ids=["<priv-a>","<priv-b>","<priv-c>"]' \
  -var="allowed_cidr=192.168.0.0/16" -var="deletion_protection=false" \
  -var="db_password=<password>"      # RDS master password: NO @ / " space
```

Defaults are **Free-Plan-safe**: PostgreSQL 16.9, `db.t4g.micro`, backup
retention 1 day, Performance Insights off, no storage autoscaling.

### 3. App secrets/config + deploy

```bash
kubectl apply -f k8s/k8s-namespace.yaml -f k8s/k8s-rbac.yaml
kubectl create secret generic db-credentials -n production-app \
  --from-literal=DB_USER=appuser --from-literal=DB_PASSWORD=<password>
# set DB_HOST in k8s/k8s-configmap.yaml to the RDS endpoint, then push to main
git push origin main        # CI/CD: build -> migrate (Job) -> deploy -> rollout
```

### 4. Expose publicly (free, NodePort + node SG)

```bash
kubectl apply -f k8s/k8s-public-nodeport.yaml     # app :30080, grafana :30300
SG=$(aws ec2 describe-instances --filters Name=tag:eks:cluster-name,Values=build-and-deploy \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 30080 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 30300 --cidr 0.0.0.0/0
kubectl get nodes -o jsonpath='{range .items[*]}{.status.addresses[?(@.type=="ExternalIP")].address}{"\n"}{end}'
# App:     http://<node-ip>:30080     Grafana: http://<node-ip>:30300  (admin/admin)
```

> Node IPs change if a node is replaced. For a stable URL use an ALB Ingress or a
> LoadBalancer Service (adds a paid ELB).

### Gotchas hit on the AWS Free Plan (and fixes)

| Problem | Fix |
|---------|-----|
| Terraform: `No valid credential sources` (creds came from `aws login`) | `eval "$(aws configure export-credentials --format env)"` before `terraform apply` |
| RDS `FreeTierRestrictionError`: backup retention too high | `backup_retention_days = 1`, Performance Insights off |
| RDS `Cannot find version 16.4` | use an offered version (`16.9`); check `aws rds describe-db-engine-versions` |
| App pods stuck **Pending** on `t3.micro` | `t3.micro` caps at **4 pods/node**; freed slots (removed metrics-server, coredns→1) and **scaled the nodegroup to 4 nodes**. Proper fix: VPC-CNI prefix delegation with a nodegroup rebuilt at `maxPodsPerNode: 110` |
| Two databases billing | deleted the stray manually-created Aurora cluster |

---

## Teardown (stop all billing)

```bash
# app + monitoring + public services
kubectl delete -f k8s/ --ignore-not-found
kubectl delete ns monitoring --ignore-not-found
# database
cd infra/terraform && terraform destroy -auto-approve   # or: aws rds delete-db-instance ...
# cluster (nodes, VPC, CFN stacks)
eksctl delete cluster --name build-and-deploy --region eu-north-1   # ~10 min
```

Removes cluster, nodes, VPC, RDS, and CloudFormation stacks. The GHCR image, the
OIDC provider, and the `github-actions-deploy` role remain (reusable) — delete
them separately if you want a full cleanup.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Could not load credentials from any providers` | Deploy job has no `role-to-assume` (old access-keys run, or empty secret) | Ensure `role-to-assume` + `id-token: write` are set |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | OIDC subject not in trust policy | Add both `environment:production` and `ref:refs/heads/main` subjects |
| kubectl `Unauthorized` / `You must be logged in` | Role has no EKS access entry | `aws eks create-access-entry` + `associate-access-policy` |
| `ImagePullBackOff` | Missing/expired GHCR pull secret or wrong-case image | Check `ghcr-pull` secret + `packages: read`; image must be lowercase |
| Pod `Pending` — `Too many pods` | `t3.micro` 4-pods/node limit | Reduce replicas, add nodes, or enable prefix delegation |
| HPA targets `<unknown>` | No `metrics-server` (no room on t3.micro) | Prefix delegation or larger nodes; harmless otherwise |
| Nodegroup stuck `CREATING`, 0 instances | Free-Plan blocks the instance type | Use a free-tier type (`t3.micro`) or upgrade to Paid plan |
| Stack won't delete — VPC has dependencies | Orphaned EKS security group / ENI | Delete the leftover SG, then delete the stack |

---

## Repo layout

```
Build-and-deploy/
├── app.js                        Express app wiring (routes, middleware, shutdown)
├── src/                          Application modules
│   ├── db.js                     PostgreSQL pool + query/ping/close
│   ├── logger.js                 Structured JSON logging (pino)
│   ├── metrics.js                Prometheus registry + /metrics
│   └── routes/
│       └── tasks.js              CRUD + validation for the tasks resource
├── migrations/
│   └── 001_init.sql              Schema: tasks table + indexes
├── scripts/
│   ├── migrate.js                Idempotent SQL migration runner (Node)
│   └── loadtest.py               Load generator / smoke test (Python, stdlib)
├── __tests__/
│   ├── app.test.js               Core endpoints (jest + supertest)
│   └── tasks.test.js             CRUD routes with a mocked DB
├── k8s/                          Kubernetes manifests
│   ├── k8s-namespace.yaml
│   ├── k8s-rbac.yaml
│   ├── k8s-configmap.yaml
│   ├── k8s-secret.yaml           DB credentials (template)
│   ├── k8s-migration-job.yaml    Runs migrations before rollout
│   ├── k8s-deployment.yaml
│   ├── k8s-service.yaml
│   └── k8s-hpa.yaml
├── monitoring/                   Observability stack
│   ├── prometheus.yaml           Prometheus + RBAC + scrape config
│   ├── grafana.yaml              Grafana + datasource + dashboard provisioning
│   └── grafana-dashboard.json    Pre-built dashboard
├── infra/
│   ├── eks-cluster.yaml          eksctl ClusterConfig (EKS)
│   └── terraform/                RDS PostgreSQL (main/variables/outputs.tf)
├── .github/workflows/
│   └── github-actions-ci-cd.yml  CI/CD pipeline
├── Dockerfile                    Multi-stage, non-root runtime
├── docker-compose.yml            Local app + Postgres stack
├── .env.example                  Local env template
└── README.md
```
