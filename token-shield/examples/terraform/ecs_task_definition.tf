# ─────────────────────────────────────────────────────────────────────────────
# ECS Task Definition
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "payment_api" {
  family                   = "payment-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]

  # 0.5 vCPU / 1 GB — adjust to match observed p99 usage
  cpu    = "512"
  memory = "1024"

  # ECS agent role: pull images, publish logs
  execution_role_arn = aws_iam_role.ecs_execution.arn

  # Application role: AWS API calls made by the container
  task_role_arn = aws_iam_role.payment_api_task.arn

  container_definitions = jsonencode([
    {
      name      = "payment-api"
      image     = "${var.ecr_repo_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]

      # Non-secret runtime configuration
      environment = [
        { name = "APP_ENV", value = "production" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "PORT", value = "8080" }
      ]

      # Secrets pulled from SSM Parameter Store at task launch
      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "/payment-api/production/db_password"
        },
        {
          name      = "STRIPE_KEY"
          valueFrom = "/payment-api/production/stripe_key"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/payment-api"
          awslogs-region        = "eu-west-1"
          awslogs-stream-prefix = "ecs"
        }
      }

      # NOTE: requires curl to be present in the container image
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/healthz || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name        = "payment-api"
    Environment = "production"
    Team        = "platform"
    ManagedBy   = "terraform"
  }
}
