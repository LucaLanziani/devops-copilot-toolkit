# ─────────────────────────────────────────────────────────────────────────────
# Example Terraform: ECS Service + ALB
# Intentionally verbose: lots of comments and default argument values.
# Run:  python scripts/compress.py examples/terraform/main.tf
# ─────────────────────────────────────────────────────────────────────────────

# ----- ECS Cluster -----------------------------------------------------------

# Create a dedicated ECS cluster for the payment platform
resource "aws_ecs_cluster" "payment" {
  # Cluster name must be unique within the account
  name = "payment-platform"

  # Enable Container Insights for CloudWatch metrics
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

# ----- Task Definition -------------------------------------------------------

# Task definition for the payment-api container
resource "aws_ecs_task_definition" "payment_api" {
  # Unique family name — a new revision is created on every apply
  family                   = "payment-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]

  # CPU and memory units (1 vCPU = 1024 units)
  cpu    = "512"
  memory = "1024"

  # IAM role used by the ECS agent to pull images and publish logs
  execution_role_arn = aws_iam_role.ecs_execution.arn

  # IAM role assumed by the running container for AWS API calls
  task_role_arn = aws_iam_role.payment_api_task.arn

  # Inline JSON container definition
  container_definitions = jsonencode([
    {
      name      = "payment-api"
      image     = "${var.ecr_repo_url}:${var.image_tag}"
      essential = true

      # Port mappings for the application
      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]

      # Environment variables — non-secret values only
      environment = [
        { name = "APP_ENV", value = "production" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "PORT", value = "8080" }
      ]

      # Secrets retrieved from SSM Parameter Store at task start
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

      # Forward container logs to CloudWatch Logs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/payment-api"
          awslogs-region        = "eu-west-1"
          awslogs-stream-prefix = "ecs"
        }
      }

      # Health check run inside the container
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

# ----- ECS Service -----------------------------------------------------------

resource "aws_ecs_service" "payment_api" {
  name            = "payment-api"
  cluster         = aws_ecs_cluster.payment.id
  task_definition = aws_ecs_task_definition.payment_api.arn

  # Desired number of running tasks
  desired_count = 3

  # Use Fargate launch type
  launch_type = "FARGATE"

  # Minimum healthy percent during deployments
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Use the rolling update deployment controller
  deployment_controller {
    type = "ECS"
  }

  # Network configuration for awsvpc mode
  network_configuration {
    subnets = var.private_subnet_ids
    # Attach the ECS tasks security group
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  # Register tasks with the ALB target group
  load_balancer {
    target_group_arn = aws_lb_target_group.payment_api.arn
    container_name   = "payment-api"
    container_port   = 8080
  }

  # Allow ECS to manage the desired_count via App Auto Scaling
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.https]

  tags = {
    Name        = "payment-api"
    Environment = "production"
    Team        = "platform"
    ManagedBy   = "terraform"
  }
}

# ----- Application Load Balancer ---------------------------------------------

resource "aws_lb" "payment" {
  name               = "payment-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  # Enable deletion protection in production
  enable_deletion_protection = true

  # Enable access logging to S3
  access_logs {
    bucket  = var.alb_logs_bucket
    prefix  = "payment-api"
    enabled = true
  }

  tags = {
    Name        = "payment-api-alb"
    Environment = "production"
    Team        = "platform"
    ManagedBy   = "terraform"
  }
}

# HTTPS listener — forwards to the payment-api target group
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.payment.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.payment_api.arn
  }
}

# Target group for ECS tasks
resource "aws_lb_target_group" "payment_api" {
  name        = "payment-api-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  # Health check configuration
  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/healthz"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name        = "payment-api-tg"
    Environment = "production"
    Team        = "platform"
    ManagedBy   = "terraform"
  }
}
