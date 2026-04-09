output "ec2_sg_id" {
  description = "EC2 security group ID"
  value       = aws_security_group.ec2.id
}

output "elasticache_sg_id" {
  description = "ElastiCache security group ID"
  value       = aws_security_group.elasticache.id
}
