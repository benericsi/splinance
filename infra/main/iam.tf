# The identity Airflow runs as. Its access key is created by hand (see docs/data-track.md):
# a key created here would be stored in Terraform state in plain text.

resource "aws_iam_user" "airflow" {
  name = "splinance-airflow"
}

locals {
  lake_prefixes = ["landing", "raw", "clean", "quarantine"]
}

# Least privilege: list, read and write inside the lake's prefixes, delete only in landing/.
# Missing on purpose: s3:DeleteObjectVersion (raw/ cannot lose history even when a file is
# overwritten), any other bucket, bucket settings, and IAM.
data "aws_iam_policy_document" "airflow_lake" {
  statement {
    sid       = "ListLakePrefixes"
    actions   = ["s3:ListBucket"]
    resources = [module.lake.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [for p in local.lake_prefixes : "${p}/*"]
    }
  }

  # Object actions take object ARNs (bucket/key); s3:ListBucket above takes the bucket ARN.
  statement {
    sid       = "ReadWriteLakeObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = [for p in local.lake_prefixes : "${module.lake.arn}/${p}/*"]
  }

  statement {
    sid       = "ConsumeLanding"
    actions   = ["s3:DeleteObject"]
    resources = ["${module.lake.arn}/landing/*"]
  }
}

resource "aws_iam_policy" "airflow_lake" {
  name        = "splinance-airflow-lake"
  description = "Airflow: read and write the Splinance lake, delete only in landing/"
  policy      = data.aws_iam_policy_document.airflow_lake.json
}

resource "aws_iam_user_policy_attachment" "airflow_lake" {
  user       = aws_iam_user.airflow.name
  policy_arn = aws_iam_policy.airflow_lake.arn
}
