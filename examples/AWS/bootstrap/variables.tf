variable "aws_region" {
  description = "AWS region where the S3 bucket will be created"
  type        = string
  default     = "eu-west-1"
}

variable "bucket_name" {
  description = "Name of the S3 bucket for Terraform state storage. Must be globally unique."
  type        = string
  default     = "ai-tf-terraform-state"
}

variable "tags" {
  description = "Tags to apply to the S3 bucket"
  type        = map(string)
  default = {
    Purpose   = "Terraform State Storage"
    ManagedBy = "Terraform"
  }
}
