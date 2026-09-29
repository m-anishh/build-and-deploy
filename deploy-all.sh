#!/usr/bin/env bash
# Full deploy to EKS: build+push images to ECR, apply manifests, expose via NLB.
# Runs detached so it completes even if the driving session ends.
set -uo pipefail
cd /home/manish/Build-and-deploy
R=eu-north-1
REG=135438495833.dkr.ecr.eu-north-1.amazonaws.com
NS=production-app

set -a; . backend/.env; set +a
JWT=$(openssl rand -hex 32)

echo "[1/7] ECR login"
aws ecr get-login-password --region $R | docker login -u AWS --password-stdin $REG || exit 1

echo "[2/7] build backend"
docker build -f backend/Dockerfile -t $REG/manishops-backend:latest . || exit 1
echo "[2/7] build ml"
docker build -t $REG/manishops-ml:latest ai/ml || exit 1

echo "[3/7] push"
docker push $REG/manishops-backend:latest || exit 1
docker push $REG/manishops-ml:latest || exit 1

echo "[4/7] base manifests"
kubectl apply -f k8s/k8s-namespace.yaml
kubectl apply -f k8s/k8s-rbac.yaml
kubectl apply -f k8s/k8s-configmap.yaml

echo "[4/7] secret"
kubectl create secret generic db-credentials -n $NS \
  --from-literal=DB_USER="${DB_USER}" \
  --from-literal=DB_PASSWORD="${DB_PASSWORD}" \
  --from-literal=JWT_SECRET="${JWT}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "[5/7] ml + migration"
kubectl apply -f k8s/ml-deployment.yaml
kubectl delete job db-migrate -n $NS --ignore-not-found
kubectl apply -f k8s/k8s-migration-job.yaml
kubectl wait --for=condition=complete job/db-migrate -n $NS --timeout=180s \
  || kubectl logs job/db-migrate -n $NS --tail=50

echo "[6/7] app + services"
kubectl apply -f k8s/k8s-deployment.yaml
kubectl apply -f k8s/k8s-service.yaml
kubectl apply -f k8s/k8s-service-lb.yaml
kubectl rollout status deploy/devops-ml -n $NS --timeout=200s
kubectl rollout status deploy/devops-app -n $NS --timeout=300s

echo "[7/7] public URL (NLB provisioning ~2-4 min)"
for i in $(seq 1 36); do
  LB=$(kubectl get svc devops-app-public -n $NS -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)
  if [ -n "$LB" ]; then echo "PUBLIC_URL=http://$LB"; break; fi
  sleep 10
done
kubectl get pods -n $NS
echo "DEPLOY_DONE"
