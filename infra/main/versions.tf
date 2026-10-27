terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State lives in the bucket created by ../bootstrap. use_lockfile keeps a lock object next
  # to the state while a plan or apply runs, so two runs cannot write it at the same time.
  backend "s3" {
    bucket       = "bener-tfstate"
    key          = "splinance/main.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "eu-central-1"

  # On every resource: lets Billing split costs by project (cost allocation tag `project`).
  default_tags {
    tags = {
      project    = "splinance"
      env        = "dev"
      managed-by = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
