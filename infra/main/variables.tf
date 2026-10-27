variable "alert_email" {
  description = "Where budget alerts go. Set it in terraform.tfvars (gitignored), not in code."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget; alerts at 85% and 100% actual, and 100% forecast."
  type        = number
  default     = 5
}
