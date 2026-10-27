# The bucket that holds Terraform state for every stack in this AWS account. Its own state is
# local (gitignored): it is created once and rarely changes. If that file is lost, bring the
# bucket back under Terraform with `terraform import` instead of creating it again.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "eu-central-1"

  # Account-level, not part of a project.
  default_tags {
    tags = {
      managed-by = "terraform"
      stack      = "bootstrap"
    }
  }
}

module "state_bucket" {
  source = "../modules/private-bucket"
  name   = "bener-tfstate"
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = module.state_bucket.id

  # Every apply writes a new state version; old ones are only needed for a recent rollback.
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

output "state_bucket" {
  value = module.state_bucket.id
}
