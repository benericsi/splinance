# The data lake. Layout (landing/, raw/, clean/, quarantine/) is described in
# docs/data-track.md and built in code by splinance_data.lake.paths.

module "lake" {
  source = "../modules/private-bucket"
  name   = "splinance-lake-bener"
}

resource "aws_s3_bucket_lifecycle_configuration" "lake" {
  bucket = module.lake.id

  # Files are moved out of landing/ once processed; anything left is a forgotten upload.
  rule {
    id     = "expire-landing"
    status = "Enabled"

    filter {
      prefix = "landing/"
    }

    expiration {
      days = 7
    }
  }

  # Versioning keeps every overwritten object; without this they would be kept (and billed)
  # forever. 30 days is enough to undo a bad rerun.
  rule {
    id     = "trim-old-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
