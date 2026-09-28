# ---------------------------------------------------------------------------
# RDS PostgreSQL for the devops-app, provisioned into the existing EKS VPC.
#
#   terraform init
#   terraform apply -var="vpc_id=vpc-xxxx" -var='subnet_ids=["subnet-a","subnet-b"]' \
#                   -var="db_password=..." -var="allowed_cidr=10.0.0.0/16"
#
# Outputs the DB endpoint + a Secrets Manager secret ARN that External Secrets
# (or a manual kubectl secret) can consume.
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# Subnet group spanning the private subnets of the EKS VPC.
resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnets"
  subnet_ids = var.subnet_ids
  tags       = local.tags
}

# Security group: Postgres reachable only from within the cluster CIDR.
resource "aws_security_group" "db" {
  name        = "${var.name}-db-sg"
  description = "Allow Postgres from the EKS cluster"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = var.multi_az
  publicly_accessible    = false

  backup_retention_period = var.backup_retention_days
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = !var.deletion_protection
  apply_immediately       = true

  performance_insights_enabled = true

  tags = local.tags
}

# Store connection details in Secrets Manager so the cluster never needs the
# password in plaintext Terraform state consumers.
resource "aws_secretsmanager_secret" "db" {
  name        = "${var.name}/db-credentials"
  description = "PostgreSQL credentials for ${var.name}"
  tags        = local.tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    DB_HOST     = aws_db_instance.this.address
    DB_PORT     = tostring(aws_db_instance.this.port)
    DB_NAME     = var.db_name
    DB_USER     = var.db_username
    DB_PASSWORD = var.db_password
  })
}

locals {
  tags = {
    project    = var.name
    managed-by = "terraform"
  }
}
