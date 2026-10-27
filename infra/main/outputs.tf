output "lake_bucket" {
  value = module.lake.id
}

output "airflow_user" {
  description = "Create its access key by hand: aws iam create-access-key --user-name <this>"
  value       = aws_iam_user.airflow.name
}
