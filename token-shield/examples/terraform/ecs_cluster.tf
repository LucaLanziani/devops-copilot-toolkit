# ─────────────────────────────────────────────────────────────────────────────
# ECS Cluster
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "payment" {
  name = "payment-platform"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "payment-platform"
    Environment = "production"
    Team        = "platform"
    ManagedBy   = "terraform"
  }
}
