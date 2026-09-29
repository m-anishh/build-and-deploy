variable "name" {
  description = "Project/resource name prefix"
  type        = string
  default     = "build-and-deploy"
}

variable "region" {
  description = "AWS region (should match the EKS cluster)"
  type        = string
  default     = "eu-north-1"
}

variable "vpc_id" {
  description = "VPC ID of the EKS cluster to place RDS in"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the DB subnet group (2+ AZs)"
  type        = list(string)
}

variable "allowed_cidr" {
  description = "CIDR allowed to reach Postgres (e.g. the VPC/node CIDR)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.9"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Initial storage (GiB)"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Autoscaling storage ceiling (GiB); 0 disables autoscaling (required on AWS Free Plan)"
  type        = number
  default     = 0
}

variable "performance_insights" {
  description = "Enable Performance Insights (blocked on AWS Free Plan / small instances)"
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Master username"
  type        = string
  default     = "appuser"
}

variable "db_password" {
  description = "Master password (pass via TF_VAR_db_password or a tfvars file — do not commit)"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ for high availability"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Automated backup retention in days (AWS Free Plan caps this low; 1 is safe)"
  type        = number
  default     = 1
}

variable "deletion_protection" {
  description = "Protect the DB from accidental deletion (also keeps a final snapshot)"
  type        = bool
  default     = true
}
