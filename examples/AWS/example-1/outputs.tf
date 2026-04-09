output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = module.ec2.instance_id
}

output "elasticache_cluster_id" {
  description = "ElastiCache cluster ID"
  value       = module.elasticache.cluster_id
}

output "security_group_ids" {
  description = "Security group IDs for EC2 and ElastiCache"
  value = {
    ec2_sg         = module.security_groups.ec2_sg_id
    elasticache_sg = module.security_groups.elasticache_sg_id
  }
}
