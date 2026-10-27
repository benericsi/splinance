# Cost alerts. include_credit = false on both: while Free plan credits last they would hide
# every cost, so the alerts would never fire; this way they report what is being used up.

# zero-spend was created in the console before Terraform managed this account and was
# brought under Terraform with an import block (removed once applied):
#   import {
#     to = aws_budgets_budget.zero_spend
#     id = "${data.aws_caller_identity.current.account_id}:zero-spend"
#   }
resource "aws_budgets_budget" "zero_spend" {
  name        = "zero-spend"
  budget_type = "COST"
  # Set by the console on creation (the account's default billing view); kept so the plan
  # does not try to clear it.
  billing_view_arn = "arn:aws:billing::${data.aws_caller_identity.current.account_id}:billingview/primary"
  limit_amount     = "1.0"
  limit_unit       = "USD"
  time_unit        = "MONTHLY"

  cost_types {
    include_credit = false
  }

  # Anything above one cent.
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 0.01
    threshold_type             = "ABSOLUTE_VALUE"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_budgets_budget" "monthly" {
  name         = "monthly-${var.monthly_budget_usd}usd"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 85
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }

  # Warns before the month ends, when the trend points past the limit.
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "FORECASTED"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }
}
