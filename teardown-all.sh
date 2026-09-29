#!/usr/bin/env bash
# Destroy all AWS resources to stop billing. RDS data kept as a final snapshot.
set -uo pipefail
R=eu-north-1

echo "[1/4] RDS delete (with final snapshot devops-app-final-20260929)"
aws rds delete-db-instance --db-instance-identifier devops-app-postgres \
  --final-db-snapshot-identifier devops-app-final-20260929 \
  --region $R 2>&1 | tail -2 || echo "rds delete issued/failed"

echo "[2/4] EKS cluster delete (~10-15 min, removes nodes + VPC)"
eksctl delete cluster --name build-and-deploy --region $R --wait 2>&1 | tail -8

echo "[3/4] ECR repos delete"
aws ecr delete-repository --repository-name manishops-backend --force --region $R 2>&1 | tail -1
aws ecr delete-repository --repository-name manishops-ml --force --region $R 2>&1 | tail -1

echo "[4/4] done"
echo "TEARDOWN_DONE"
