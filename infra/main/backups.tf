# Offsite database backups (docs/deploy.md, "Backups"). Railway Hobby cannot create backups,
# so a cron service on Railway dumps both databases every night, encrypts them with age to a
# key that lives only in the owner's password manager, and uploads them here.

module "backups" {
  source = "../modules/private-bucket"
  name   = "splinance-backups-bener"
}

locals {
  # Prefix -> days a backup is kept. The prefixes end in "/" so splinance/ never matches
  # splinance_demo/. The job writes nowhere else (the IAM policy below allows only these).
  backup_retention_days = {
    "splinance/daily/"      = 35
    "splinance/monthly/"    = 400 # 13 months
    "splinance_demo/daily/" = 14  # the demo is reproducible from its seed
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = module.backups.id

  dynamic "rule" {
    for_each = local.backup_retention_days

    content {
      id     = "expire-${trimsuffix(replace(rule.key, "/", "-"), "-")}"
      status = "Enabled"

      filter {
        prefix = rule.key
      }

      expiration {
        days = rule.value
      }
    }
  }

  # Expiring a file in a versioned bucket only hides it behind a delete marker; the hidden
  # version goes after 7 more days, then the leftover marker. No Glacier transitions: the
  # files are a few MB, so minimum storage duration charges would cost more than they save.
  rule {
    id     = "clean-up-versions"
    status = "Enabled"
    filter {}

    expiration {
      expired_object_delete_marker = true
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# The identity the backup job runs as. Its access key is created by hand (docs/deploy.md): a key
# created here would be stored in Terraform state in plain text.
resource "aws_iam_user" "backup" {
  name = "splinance-backup"
}

# Write-only: a leaked key can add files under the backup prefixes, never list, read, overwrite
# or delete one. Uploads must send If-None-Match: * (the job uses put-object --if-none-match),
# so S3 refuses to replace an existing key. Without the header the Allow does not match, which
# fails closed: the nightly run fails and Healthchecks reports it.
data "aws_iam_policy_document" "backup_put" {
  statement {
    sid       = "PutNewBackups"
    actions   = ["s3:PutObject"]
    resources = [for prefix in keys(local.backup_retention_days) : "${module.backups.arn}/${prefix}*"]

    condition {
      test     = "StringEquals"
      variable = "s3:if-none-match"
      values   = ["*"]
    }
  }
}

resource "aws_iam_policy" "backup_put" {
  name        = "splinance-backup-put"
  description = "Backup job: add new files under the backup prefixes, nothing else"
  policy      = data.aws_iam_policy_document.backup_put.json
}

resource "aws_iam_user_policy_attachment" "backup_put" {
  user       = aws_iam_user.backup.name
  policy_arn = aws_iam_policy.backup_put.arn
}
