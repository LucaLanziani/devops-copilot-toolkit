terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# ──────────────────────────────────────────────
# VPC & Networking
# ──────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = { Name = "main-vpc" }
}

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1b"
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.4.0/24"
  availability_zone = "us-east-1b"
}

# ⚠️ ISSUE: Two NAT Gateways (one per AZ) — fine for prod, but costly
resource "aws_eip" "nat_a" { domain = "vpc" }
resource "aws_eip" "nat_b" { domain = "vpc" }

resource "aws_nat_gateway" "az_a" {
  allocation_id = aws_eip.nat_a.id
  subnet_id     = aws_subnet.public_a.id
  tags = { Name = "nat-az-a" }
}

resource "aws_nat_gateway" "az_b" {
  allocation_id = aws_eip.nat_b.id
  subnet_id     = aws_subnet.public_b.id
  tags = { Name = "nat-az-b" }
}

# ──────────────────────────────────────────────
# EC2 — Web Servers
# ──────────────────────────────────────────────

# ⚠️ ISSUE: Large On-Demand instance, no Spot, no Savings Plan
resource "aws_instance" "web" {
  count         = 3
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "m5.2xlarge"   # 8 vCPU, 32GB — likely oversized for a web tier

  subnet_id = aws_subnet.private_a.id

  # ⚠️ ISSUE: gp2 root volume
  root_block_device {
    volume_type = "gp2"
    volume_size = 100
  }

  # ⚠️ ISSUE: detailed monitoring on every instance
  monitoring = true

  tags = { Name = "web-${count.index}", Env = "production" }
}

# ⚠️ ISSUE: Unattached EBS volume (orphaned)
resource "aws_ebs_volume" "old_data" {
  availability_zone = "us-east-1a"
  size              = 500
  type              = "gp2"
  tags = { Name = "old-data-disk" }
}

# ──────────────────────────────────────────────
# RDS — Database
# ──────────────────────────────────────────────

# ⚠️ ISSUE: Oversized RDS instance
# ⚠️ ISSUE: gp2 storage
# ⚠️ ISSUE: High backup retention
resource "aws_db_instance" "main" {
  identifier        = "main-db"
  engine            = "postgres"
  engine_version    = "15.3"
  instance_class    = "db.r5.2xlarge"   # 8 vCPU, 64GB RAM — very large
  allocated_storage = 1000
  storage_type      = "gp2"             # should be gp3
  multi_az          = true
  backup_retention_period = 30          # 30 days backup = lots of storage

  username = "admin"
  password = "changeme123"

  skip_final_snapshot = false
  tags = { Name = "main-db", Env = "production" }
}

# ⚠️ ISSUE: Dev RDS also has multi_az = true (unnecessary)
resource "aws_db_instance" "dev" {
  identifier        = "dev-db"
  engine            = "postgres"
  engine_version    = "15.3"
  instance_class    = "db.r5.xlarge"   # Still large for dev
  allocated_storage = 200
  storage_type      = "gp2"
  multi_az          = true             # No need for HA in dev!
  backup_retention_period = 14

  username = "admin"
  password = "changeme123"

  skip_final_snapshot = true
  tags = { Name = "dev-db", Env = "dev" }
}

# ──────────────────────────────────────────────
# ElastiCache — Redis
# ──────────────────────────────────────────────

# ⚠️ ISSUE: 3-node Redis cluster — likely 1 node is enough for dev/staging
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "main-redis"
  description          = "Main Redis cluster"

  node_type            = "cache.r6g.xlarge"  # 4 vCPU, 13GB
  num_cache_clusters   = 3
  automatic_failover_enabled = true

  tags = { Name = "main-redis" }
}

# ──────────────────────────────────────────────
# S3 Buckets
# ──────────────────────────────────────────────

# ⚠️ ISSUE: No lifecycle rules — objects accumulate in STANDARD forever
resource "aws_s3_bucket" "app_data" {
  bucket = "myapp-data-bucket-prod"
  tags   = { Name = "app-data" }
}

resource "aws_s3_bucket" "logs" {
  bucket = "myapp-logs-prod"
  tags   = { Name = "app-logs" }
}

# ⚠️ ISSUE: Logs bucket also has no lifecycle — logs pile up forever
# No aws_s3_bucket_lifecycle_configuration for either bucket

# ──────────────────────────────────────────────
# CloudWatch Logs
# ──────────────────────────────────────────────

# ⚠️ ISSUE: No retention policy — logs kept forever at $0.03/GB/mo
resource "aws_cloudwatch_log_group" "app" {
  name = "/app/production"
  # retention_in_days not set!
}

resource "aws_cloudwatch_log_group" "nginx" {
  name = "/app/nginx"
  # retention_in_days not set!
}

resource "aws_cloudwatch_log_group" "ecs" {
  name = "/ecs/tasks"
  # retention_in_days not set!
}

# ──────────────────────────────────────────────
# EKS Cluster
# ──────────────────────────────────────────────

resource "aws_eks_cluster" "main" {
  name     = "main-cluster"
  role_arn = "arn:aws:iam::123456789012:role/eks-cluster-role"

  vpc_config {
    subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  }
}

# ⚠️ ISSUE: All On-Demand, no Spot instances
# ⚠️ ISSUE: min_size = desired_size (no scale-to-zero)
resource "aws_eks_node_group" "workers" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "workers"
  node_role_arn   = "arn:aws:iam::123456789012:role/eks-node-role"
  subnet_ids      = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  instance_types = ["m5.xlarge"]
  capacity_type  = "ON_DEMAND"   # ⚠️ No spot instances

  scaling_config {
    min_size     = 5
    max_size     = 10
    desired_size = 5   # ⚠️ Always running at min capacity
  }

  # ⚠️ ISSUE: gp2 disk for nodes
  disk_size = 100  # gp2 by default in older node group configs
}
