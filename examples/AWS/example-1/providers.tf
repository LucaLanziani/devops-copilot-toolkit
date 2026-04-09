terraform {
  required_version = ">= 1.5.0"
  
  backend "s3" {
    bucket = "ai-tf-terraform-state"
    key    = "example-1/terraform.tfstate"
    region = "eu-west-1"
  }
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
