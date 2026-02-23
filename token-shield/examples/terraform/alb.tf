# ─────────────────────────────────────────────────────────────────────────────
# Application Load Balancer, HTTPS Listener, and Target Group
# ─────────────────────────────────────────────────────────────────────────────

# ----- ALB -------------------------------------------------------------------

resource "aws_lb" "payment" {
  name               = "payment-api-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = true

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

# ----- Listeners -------------------------------------------------------------

# Redirect plain HTTP to HTTPS
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.payment.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

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

# ----- Target Group ----------------------------------------------------------

resource "aws_lb_target_group" "payment_api" {
  name        = "payment-api-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

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
