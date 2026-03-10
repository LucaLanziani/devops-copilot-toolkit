output "bucket_name" {
  description = "Name of the S3 bucket for Terraform state storage"
  value       = aws_s3_bucket.terraform_state.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket for Terraform state storage"
  value       = aws_s3_bucket.terraform_state.arn
}

output "bucket_region" {
  description = "AWS region where the S3 bucket is located"
  value       = aws_s3_bucket.terraform_state.region
}
