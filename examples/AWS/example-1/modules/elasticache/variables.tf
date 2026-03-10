variable "subnet_ids" {
  description = "Subnet IDs for ElastiCache"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for ElastiCache"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
}

variable "num_nodes" {
  description = "Number of cache nodes"
  type        = number
}

variable "project_name" {
  description = "Project name tag"
  type        = string
}
