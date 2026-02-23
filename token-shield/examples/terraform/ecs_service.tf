# ─────────────────────────────────────────────────────────────────────────────
# ECS Service
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_ecs_service" "payment_api" {
  name            = "payment-api"
  cluster         = aws_ecs_cluster.payment.id
  task_definition = aws_ecs_task_definition.payment_api.arn

  # Managed by App Auto Scaling — ignore drift on desired_count
  desired_count = 3

  launch_type = "FARGATE"

  # Zero-downtime rolling deployments
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_controller {
    type = "ECS"
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.payment_api.arn
    container_name   = "payment-api"
    container_port   = 8080
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  # Ensure the ALB listener exists before the service registers targets
  depends_on = [aws_lb_listener.https]

  tags = {
    Name        = "payment-api"
    Environment = "production"
    Team        = "platform"
    ManagedBy   = "terraform"
  }
}
