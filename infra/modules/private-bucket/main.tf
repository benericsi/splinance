# A private S3 bucket with the settings every bucket in this account needs. Lifecycle rules
# differ per bucket, so the caller adds its own `aws_s3_bucket_lifecycle_configuration`.

resource "aws_s3_bucket" "this" {
  bucket = var.name

  # Holds Terraform state or raw data: `terraform destroy` must not take it down by accident.
  lifecycle {
    prevent_destroy = true
  }
}

# AWS blocks public access on new buckets by default; stating it here makes a change show up
# as drift in `terraform plan`.
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Overwrites and deletes keep the previous version, so nothing is lost for good by mistake.
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3: encrypted at rest with keys AWS manages, at no cost (a customer-managed KMS key
# would cost $1 a month and add nothing here).
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Refuse plain HTTP for everyone, admins included: an explicit Deny beats any Allow.
data "aws_iam_policy_document" "tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.tls_only.json

  # S3 rejects a bucket policy while public access settings are still being applied.
  depends_on = [aws_s3_bucket_public_access_block.this]
}
