output "db_endpoint" {
  description = "RDS endpoint hostname"
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "RDS port"
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name"
  value       = var.db_name
}

output "db_secret_arn" {
  description = "Secrets Manager ARN holding the DB credentials JSON"
  value       = aws_secretsmanager_secret.db.arn
}

output "kubectl_create_secret_hint" {
  description = "Command to create the K8s secret from Terraform outputs"
  value       = <<-EOT
    kubectl create secret generic db-credentials -n production-app \
      --from-literal=DB_HOST=${aws_db_instance.this.address} \
      --from-literal=DB_PORT=${aws_db_instance.this.port} \
      --from-literal=DB_NAME=${var.db_name} \
      --from-literal=DB_USER=${var.db_username} \
      --from-literal=DB_PASSWORD='<password>'
  EOT
}
