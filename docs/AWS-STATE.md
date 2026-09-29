# AWS State — resume reference

> Snapshot of the AWS resources + how to rebuild them.
> Last updated: 2026-09-29. **Status: TORN DOWN to stop billing. RDS data kept as a final snapshot.**

---

## ▶ RESTORE TOMORROW (rebuild from scratch)

Everything below was deleted to save cost. Code is in git; RDS data is in a snapshot.

```bash
# 1. Recreate the EKS cluster (~15-20 min)
cd ~/Build-and-deploy
eksctl create cluster -f infra/eks-cluster.yaml
eksctl scale nodegroup --cluster build-and-deploy --name workers --nodes 4 --nodes-max 4 --region eu-north-1

# 2. Restore RDS from the final snapshot (data preserved: users, tasks)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier devops-app-postgres \
  --db-snapshot-identifier devops-app-final-20260929 \
  --db-instance-class db.t4g.micro --publicly-accessible \
  --region eu-north-1
# wait until available, then note the NEW endpoint:
aws rds describe-db-instances --db-instance-identifier devops-app-postgres \
  --query "DBInstances[0].Endpoint.Address" --output text --region eu-north-1
# update DB_HOST in backend/.env and k8s/k8s-configmap.yaml to that endpoint
# reopen RDS security group to your IP + the new node IPs on 5432

# 3. Deploy everything (rebuilds images to ECR, applies manifests, public NLB)
./deploy-all.sh
```

> If the snapshot restore is skipped, the app still boots and migrations recreate empty
> tables — but previous users/tasks are only in the snapshot.

---

## Original live values (for reference / recreate)

## Account
- Account ID: `135438495833`
- Region: `eu-north-1`

## EKS
- Cluster: `build-and-deploy` (Kubernetes 1.32)
- Nodegroup: `workers` — 4× `t3.micro` (scaled up from 2 for pod capacity)
- Namespace: `production-app`
- **Reconnect kubeconfig:**
  ```bash
  aws eks update-kubeconfig --name build-and-deploy --region eu-north-1
  kubectl get pods -n production-app
  ```

## Public URL (NLB)
```
http://aee2f6b6baa794c84bc4e00f7cfc6d51-c1aa0eb14c08a56d.elb.eu-north-1.amazonaws.com
```
Service: `devops-app-public` (type LoadBalancer / NLB).

## RDS (PostgreSQL)
- Identifier: `devops-app-postgres`
- Endpoint: `devops-app-postgres.cne6gw6g6pnx.eu-north-1.rds.amazonaws.com:5432`
- DB: `appdb` · user: `appuser` · engine: Postgres 18 · status: available
- Credentials: in `backend/.env` (gitignored) and the K8s `db-credentials` Secret.
- Security group: `sg-05a52d2b7fed18b67` — 5432 open to this dev IP + the 4 EKS node public IPs.
- Migrations applied: `001_init`, `002_users`, `003_oauth`.

## ECR
- Registry: `135438495833.dkr.ecr.eu-north-1.amazonaws.com`
- Repos: `manishops-backend`, `manishops-ml` (tag `latest`)
- **Login:** `aws ecr get-login-password --region eu-north-1 | docker login -u AWS --password-stdin 135438495833.dkr.ecr.eu-north-1.amazonaws.com`

## Redeploy (after code changes)
```bash
./deploy-all.sh          # rebuild → push ECR → apply → rollout → print URL
# or just the app image:
docker build -f backend/Dockerfile -t 135438495833.dkr.ecr.eu-north-1.amazonaws.com/manishops-backend:latest .
docker push 135438495833.dkr.ecr.eu-north-1.amazonaws.com/manishops-backend:latest
kubectl rollout restart deploy/devops-app -n production-app
```

## Local services (for SSH-tunnel dev; do NOT rely on these overnight)
- Backend: `cd backend && set -a && . ./.env && set +a && node app.js` (:3000, serves UI)
- ML: `cd ai/ml && .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

## OAuth setup (to enable Google + GitHub buttons)
Backend code is ready; buttons enable automatically once these env vars are set on the
`db-credentials`/config and the app is redeployed. Redirect URIs use the public URL above.

**Google** (console.cloud.google.com → Credentials → OAuth client, Web):
- Authorized redirect URI: `http://<public-url>/api/auth/google/callback`
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**GitHub** (github.com/settings/developers → New OAuth App):
- Authorization callback URL: `http://<public-url>/api/auth/github/callback`
- Env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

Also set `APP_BASE_URL=http://<public-url>` so redirect URIs are built correctly.
Add these to the K8s secret and `kubectl rollout restart deploy/devops-app -n production-app`.

## ⚠️ Cost while running
EKS control plane + 4× t3.micro + NLB + RDS ≈ ~$120/mo (~$4/day). Left running per request.

## Full teardown (when finished)
```bash
kubectl delete -f k8s/k8s-service-lb.yaml
eksctl delete cluster --name build-and-deploy --region eu-north-1
aws rds delete-db-instance --db-instance-identifier devops-app-postgres --skip-final-snapshot --region eu-north-1
aws ecr delete-repository --repository-name manishops-backend --force --region eu-north-1
aws ecr delete-repository --repository-name manishops-ml --force --region eu-north-1
```
