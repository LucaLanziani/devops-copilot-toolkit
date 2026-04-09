output "cluster_id" {
  description = "ElastiCache cluster ID"
  value       = aws_elasticache_cluster.this.id
}
