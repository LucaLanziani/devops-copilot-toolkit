variable "ecr_repo_url" {
  description = "URL of the ECR repository (without tag)."
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to deploy."
  type        = string
  default     = "latest"
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks."
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB."
  type        = list(string)
}

variable "vpc_id" {
  description = "ID of the VPC."
  type        = string
}

variable "alb_logs_bucket" {
  description = "S3 bucket name for ALB access logs."
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS termination."
  type        = string
}
