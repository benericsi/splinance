output "lake_bucket" {
  value = module.lake.id
}

output "airflow_user" {
  description = "Create its access key by hand: aws iam create-access-key --user-name <this>"
  value       = aws_iam_user.airflow.name
}

output "backups_bucket" {
  value = module.backups.id
}

output "backup_user" {
  description = "Create its access key by hand: aws iam create-access-key --user-name <this>"
  value       = aws_iam_user.backup.name
}
