variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Project name tag"
  type        = string
  default     = "ai-tf"
}

# Networking
variable "vpc_id" {
  description = "VPC ID where resources will be created"
  type        = string
  default     = "my-vpc-id"
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for EC2 and ElastiCache"
  type        = list(string)
  default     = ["my-private-subnet-id-1", "my-private-subnet-id-2"]
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH into EC2"
  type        = string
  default     = "0.0.0.0/0"
}

# EC2 settings
variable "ec2_ami_id" {
  description = "AMI ID for EC2 instance"
  type        = string
  default     = "ami-0abcdef1234567890"
}

variable "ec2_instance_type" {
  description = "Instance type for EC2"
  type        = string
  default     = "t3.micro"
}

# ElastiCache settings
variable "elasticache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "elasticache_num_nodes" {
  description = "Number of nodes in the Redis cluster"
  type        = number
  default     = 1
}
