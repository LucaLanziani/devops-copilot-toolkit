variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH into EC2"
  type        = string
}

variable "project_name" {
  description = "Project name tag"
  type        = string
  default     = "ai-tf"
}
