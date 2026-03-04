# Terraform → AWS Cost Mapping Reference

Quick reference for identifying costly patterns in Terraform files.

---

## EC2 / Compute

### `aws_instance`
```hcl
resource "aws_instance" "example" {
  instance_type = "m5.4xlarge"    # ⚠️ Check if right-sized
  monitoring    = true             # $2.10/mo for detailed monitoring
}
```

**Red flags:**
- `instance_type` with 4xlarge, 8xlarge, 16xlarge in dev/staging
- No `spot_instance_request` or mixed fleet for stateless workloads
- `monitoring = true` on many instances (adds up)
- Missing `ebs_optimized = true` (may cause extra I/O charges on older types)

**Cost signals by family (us-east-1, On-Demand):**
| Type | vCPU | RAM | $/hr |
|---|---|---|---|
| t3.micro | 2 | 1GB | $0.010 |
| t3.medium | 2 | 4GB | $0.042 |
| m5.large | 2 | 8GB | $0.096 |
| m5.xlarge | 4 | 16GB | $0.192 |
| m5.4xlarge | 16 | 64GB | $0.768 |
| r5.2xlarge | 8 | 64GB | $0.504 |
| c5.2xlarge | 8 | 16GB | $0.340 |

---

## EBS Volumes

### `aws_ebs_volume` / `root_block_device`
```hcl
root_block_device {
  volume_type = "gp2"    # ⚠️ Migrate to gp3
  volume_size = 500      # ⚠️ Check if fully utilized
}
```

**gp2 vs gp3 pricing (us-east-1):**
- gp2: $0.10/GB/mo
- gp3: $0.08/GB/mo — **20% cheaper**, AND you get 3000 IOPS + 125 MB/s free

**Migration:**
```hcl
# After
root_block_device {
  volume_type = "gp3"
  volume_size = 500
  iops        = 3000   # baseline free
  throughput  = 125    # baseline free
}
```

---

## RDS

### `aws_db_instance`
```hcl
resource "aws_db_instance" "main" {
  instance_class    = "db.r5.2xlarge"  # ⚠️ Right-sized?
  multi_az          = true              # ⚠️ Needed in non-prod?
  storage_type      = "gp2"            # ⚠️ Migrate to gp3
  allocated_storage = 1000             # ⚠️ Actually used?
}
```

**Red flags:**
- `multi_az = true` in staging/dev (doubles cost)
- `db.r5.2xlarge` or larger for internal tools
- `storage_type = "gp2"` (same gp3 opportunity as EC2)
- `backup_retention_period` set high with large storage

**Common RDS costs (us-east-1, Single-AZ):**
| Class | $/hr | $/mo |
|---|---|---|
| db.t3.micro | $0.017 | ~$12 |
| db.t3.medium | $0.068 | ~$49 |
| db.m5.large | $0.171 | ~$123 |
| db.r5.2xlarge | $1.008 | ~$726 |

Multi-AZ = 2× these prices.

---

## NAT Gateway

### `aws_nat_gateway`
```hcl
resource "aws_nat_gateway" "main" {
  # Each NAT GW = $32.40/mo + $0.045/GB data processed
}
```

**Red flags:**
- Multiple NAT Gateways without clear necessity
- One NAT GW per AZ in non-prod (fine in prod for HA, wasteful in dev)
- High data transfer through NAT (check if workloads can use VPC endpoints)

**Cost reduction strategies:**
1. Use a **single NAT GW** in dev/staging (no HA needed)
2. Add **VPC Endpoints** for S3 and DynamoDB (free, no NAT charges)
3. Consider **NAT Instance** (t3.nano) for very low-traffic environments (~$4/mo)

---

## S3

### `aws_s3_bucket` + `aws_s3_bucket_lifecycle_configuration`
```hcl
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
  # ⚠️ Missing lifecycle rules = objects stay in STANDARD forever
}

# Add this:
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "archive-old-objects"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"   # 58% cheaper
    }
    transition {
      days          = 90
      storage_class = "GLACIER_IR"    # 68% cheaper
    }
    expiration {
      days = 365   # if objects expire
    }
  }
}
```

**S3 Storage class pricing (us-east-1, per GB/mo):**
| Class | Price | Use case |
|---|---|---|
| STANDARD | $0.023 | Frequent access |
| STANDARD_IA | $0.0125 | Infrequent, same latency |
| INTELLIGENT_TIERING | $0.023 (auto) | Unknown access patterns |
| GLACIER_IR | $0.004 | Archive, ms retrieval |
| GLACIER | $0.0036 | Archive, minutes retrieval |
| DEEP_ARCHIVE | $0.00099 | Long-term, hours retrieval |

---

## CloudWatch Logs

### `aws_cloudwatch_log_group`
```hcl
resource "aws_cloudwatch_log_group" "app" {
  name = "/app/logs"
  # ⚠️ Missing retention = logs kept forever at $0.03/GB/mo
  
  retention_in_days = 30  # Add this!
}
```

---

## EKS / Kubernetes

### `aws_eks_node_group`
```hcl
resource "aws_eks_node_group" "workers" {
  instance_types = ["m5.2xlarge"]   # ⚠️ Right-sized?
  
  scaling_config {
    min_size     = 3   # ⚠️ min=desired in non-prod?
    max_size     = 10
    desired_size = 3
  }
  # ⚠️ No spot instances for fault-tolerant workloads?
}
```

**Spot instance example (saves 60-90%):**
```hcl
resource "aws_eks_node_group" "workers_spot" {
  capacity_type  = "SPOT"
  instance_types = ["m5.xlarge", "m5a.xlarge", "m4.xlarge"]  # Multiple types for availability
}
```

---

## ElastiCache

### `aws_elasticache_cluster` / `aws_elasticache_replication_group`
```hcl
resource "aws_elasticache_replication_group" "redis" {
  num_cache_clusters = 3          # ⚠️ Needed in dev?
  node_type          = "cache.r6g.xlarge"  # ⚠️ Right-sized?
  automatic_failover_enabled = true  # Requires ≥2 nodes
}
```

---

## Data Transfer Costs (Often Overlooked)

| Transfer type | Cost |
|---|---|
| Same AZ, same service | Free |
| Cross-AZ (within region) | $0.01/GB each way |
| Cross-region | $0.02–0.09/GB |
| Internet egress (first 10TB/mo) | $0.09/GB |
| CloudFront egress | $0.0085–0.012/GB |

**In Terraform, watch for:**
- EC2 instances in different AZs communicating heavily
- S3 accessed from EC2 in different regions
- No CloudFront in front of public-facing S3/ALB

---

## Reserved Instances / Savings Plans (Not in Terraform, but recommend)

These are managed in AWS console/CLI, not Terraform, but always mention:

| Option | Savings | Commitment | Best for |
|---|---|---|---|
| EC2 Reserved (1yr, no upfront) | ~30% | 1 year | Stable EC2 |
| EC2 Reserved (1yr, all upfront) | ~37% | 1 year | Stable EC2 |
| Compute Savings Plan (1yr) | ~28% | 1 year | Flexible compute |
| RDS Reserved (1yr) | ~35% | 1 year | Production RDS |

Recommend Savings Plans over Reserved Instances when workloads may shift between instance families or switch to Lambda/Fargate.
