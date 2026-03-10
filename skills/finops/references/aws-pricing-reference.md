# AWS Pricing Quick Reference (us-east-1)

*Last updated based on AWS public pricing. Always verify at https://aws.amazon.com/pricing/*

---

## EC2 On-Demand (Linux, us-east-1)

### General Purpose
| Instance | vCPU | RAM (GB) | $/hr | $/mo |
|---|---|---|---|---|
| t3.nano | 2 | 0.5 | $0.0052 | $3.80 |
| t3.micro | 2 | 1 | $0.0104 | $7.59 |
| t3.small | 2 | 2 | $0.0208 | $15.18 |
| t3.medium | 2 | 4 | $0.0416 | $30.37 |
| t3.large | 2 | 8 | $0.0832 | $60.74 |
| m5.large | 2 | 8 | $0.096 | $70.08 |
| m5.xlarge | 4 | 16 | $0.192 | $140.16 |
| m5.2xlarge | 8 | 32 | $0.384 | $280.32 |
| m5.4xlarge | 16 | 64 | $0.768 | $560.64 |
| m7g.large | 2 | 8 | $0.0816 | $59.57 (Graviton, ~15% cheaper) |

### Compute Optimized
| Instance | vCPU | RAM (GB) | $/hr | $/mo |
|---|---|---|---|---|
| c5.large | 2 | 4 | $0.085 | $62.05 |
| c5.xlarge | 4 | 8 | $0.170 | $124.10 |
| c5.2xlarge | 8 | 16 | $0.340 | $248.20 |
| c6g.large | 2 | 4 | $0.068 | $49.64 (Graviton) |

### Memory Optimized
| Instance | vCPU | RAM (GB) | $/hr | $/mo |
|---|---|---|---|---|
| r5.large | 2 | 16 | $0.126 | $91.98 |
| r5.xlarge | 4 | 32 | $0.252 | $183.96 |
| r5.2xlarge | 8 | 64 | $0.504 | $367.92 |
| r5.4xlarge | 16 | 128 | $1.008 | $735.84 |

---

## RDS (us-east-1, Single-AZ, MySQL/PostgreSQL)

| Instance | vCPU | RAM | $/hr | $/mo |
|---|---|---|---|---|
| db.t3.micro | 2 | 1GB | $0.017 | $12.41 |
| db.t3.small | 2 | 2GB | $0.034 | $24.82 |
| db.t3.medium | 2 | 4GB | $0.068 | $49.64 |
| db.t3.large | 2 | 8GB | $0.136 | $99.28 |
| db.m5.large | 2 | 8GB | $0.171 | $124.83 |
| db.m5.xlarge | 4 | 16GB | $0.342 | $249.66 |
| db.r5.large | 2 | 16GB | $0.240 | $175.20 |
| db.r5.xlarge | 4 | 32GB | $0.480 | $350.40 |
| db.r5.2xlarge | 8 | 64GB | $0.960 | $700.80 |

*Multi-AZ = 2× these prices*

RDS Storage: gp2 $0.115/GB/mo, gp3 $0.115/GB/mo (same price, but gp3 includes 3000 IOPS free vs gp2's 3 IOPS/GB)

---

## EBS Storage (us-east-1)

| Type | Price/GB/mo | IOPS | Notes |
|---|---|---|---|
| gp2 | $0.10 | 3 IOPS/GB (max 16k) | Legacy |
| gp3 | $0.08 | 3000 free + $0.005/IOPS | Preferred |
| io1/io2 | $0.125 | $0.065/IOPS | High perf |
| st1 | $0.045 | Throughput-optimized HDD | Big data |
| sc1 | $0.025 | Cold HDD | Archival |

Snapshots: $0.05/GB/mo

---

## S3 (us-east-1)

| Storage Class | Price/GB/mo | Retrieval |
|---|---|---|
| Standard | $0.023 | Free |
| Standard-IA | $0.0125 | $0.01/GB |
| One Zone-IA | $0.01 | $0.01/GB |
| Intelligent-Tiering | $0.023 (active) | Free |
| Glacier Instant | $0.004 | $0.03/GB |
| Glacier Flexible | $0.0036 | $0.01/GB + time |
| Deep Archive | $0.00099 | $0.02/GB + hours |

PUT/COPY/POST/LIST: $0.005 per 1000 requests (Standard)
GET/SELECT: $0.0004 per 1000 requests (Standard)

---

## NAT Gateway (us-east-1)

- **Hourly**: $0.045/hr = **$32.85/mo** per NAT Gateway
- **Data processing**: $0.045/GB (in + out)
- Example: 1TB/mo data = $32.85 + $46.08 = **~$79/mo per NAT GW**

VPC Endpoints (alternative for AWS services):
- Interface endpoints: $0.01/hr + $0.01/GB
- Gateway endpoints (S3, DynamoDB): **FREE**

---

## CloudWatch

| Item | Price |
|---|---|
| Log ingestion | $0.50/GB |
| Log storage | $0.03/GB/mo |
| Metrics (custom) | $0.30/metric/mo (first 10k) |
| Dashboards | $3.00/dashboard/mo |
| Alarms | $0.10/alarm/mo |

---

## EKS

- Control plane: **$0.10/hr = $73/mo** per cluster
- Worker nodes: EC2 pricing (see above)
- Fargate: $0.04048/vCPU/hr + $0.004445/GB/hr

---

## ElastiCache (Redis, us-east-1)

| Node type | $/hr | $/mo |
|---|---|---|
| cache.t3.micro | $0.017 | $12.41 |
| cache.t3.medium | $0.068 | $49.64 |
| cache.m6g.large | $0.127 | $92.71 |
| cache.r6g.large | $0.166 | $121.18 |
| cache.r6g.xlarge | $0.332 | $242.36 |

---

## Data Transfer

| Type | Price |
|---|---|
| Inbound from internet | Free |
| Outbound to internet (first 10TB) | $0.09/GB |
| CloudFront origin → viewer | $0.0085–$0.012/GB |
| EC2 cross-AZ | $0.01/GB (each direction) |
| EC2 cross-region | $0.02/GB |
| Direct Connect (dedicated) | $0.02/GB |

---

## Savings Plans / Reserved Instances (Estimates)

| Commitment | Typical Savings |
|---|---|
| On-Demand | 0% |
| Compute Savings Plan (1yr) | ~25–30% |
| EC2 Instance Reserved (1yr, no upfront) | ~30–35% |
| EC2 Instance Reserved (1yr, all upfront) | ~37–40% |
| EC2 Instance Reserved (3yr, all upfront) | ~55–60% |

Use [AWS Cost Explorer Savings Plans recommendations](https://console.aws.amazon.com/cost-management/home#/savings-plans/recommendations) for personalized estimates.
