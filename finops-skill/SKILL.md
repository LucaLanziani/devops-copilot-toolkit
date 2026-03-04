---
name: finops-aws
description: >
  AWS FinOps skill for analyzing cloud infrastructure costs, reviewing Terraform configurations,
  and generating cost optimization recommendations. Use this skill whenever the user wants to:
  analyze AWS spending, review infrastructure costs, optimize cloud costs, audit Terraform files
  for cost efficiency, get cost reduction suggestions, understand AWS billing, compare resource
  pricing, or perform any FinOps analysis. Trigger even when the user says things like "how much
  is this costing me", "is my infra expensive", "review my terraform for costs", or
  "help me save money on AWS".
compatibility: "Optional MCP servers: aws-cost-explorer (live cost data), filesystem (Terraform file reading)"
---

# AWS FinOps Skill

A skill for analyzing AWS infrastructure costs, reviewing Terraform configurations, and producing
actionable cost optimization recommendations.

---

## Workflow Overview

```
1. Gather Context       → What does the user have? (Terraform files, AWS account access, manual info)
2. Collect Cost Data    → Pull live costs via MCP or parse Terraform for resource inventory
3. Analyze              → Identify waste patterns, right-sizing opportunities, pricing mismatches
4. Recommend            → Prioritize by estimated monthly savings, effort, and risk
5. Report               → Deliver structured findings with concrete next steps
```

---

## Step 1 — Gather Context

Ask the user what they have available:

- **Terraform files**: Can be uploaded or pasted
- **AWS Cost Explorer access** via MCP
- **Manual info**: Architecture description, rough spend, specific services

If MCP tools are connected, check what's available:
- `mcp__aws-cost-explorer__get_cost_and_usage`
- `mcp__filesystem__read_file` / `mcp__filesystem__list_directory`

If no MCP tools are available, rely on Terraform parsing + general AWS pricing knowledge.

---

## Step 2 — Collect Cost Data

### 2a. If AWS Cost Explorer MCP is available

```
Query pattern:
- Time range: last 30 days (or custom)
- Group by: SERVICE, then by RESOURCE_ID for top services
- Granularity: MONTHLY for trends, DAILY for spikes
```

Key queries to run:
1. Total spend by service (last 3 months)
2. Top 10 most expensive resources
3. Unblended costs trend (spot anomalies)
4. Reserved vs On-Demand split per service

### 2b. If only Terraform is available

Parse `.tf` files to inventory resources. See [references/terraform-cost-mapping.md](./references/terraform-cost-mapping.md) for resource-to-cost mappings and red flags.

Key things to extract from Terraform:
- EC2 instance types and counts
- RDS instance classes, Multi-AZ, storage
- NAT Gateways (very expensive — $0.045/GB + $32/mo each)
- ElasticSearch/OpenSearch domain sizes
- EKS node group instance types
- Data transfer patterns (cross-AZ, cross-region)
- S3 storage classes and lifecycle policies
- CloudFront vs direct S3 serving

---

## Step 3 — Analyze: Common AWS Cost Waste Patterns

Work through these categories systematically:

### 🔴 High Impact (check first)

| Pattern | Signal | Est. Savings |
|---|---|---|
| Oversized EC2 instances | CPU <20% avg, large instance type | 30–70% on compute |
| NAT Gateway data charges | High data transfer + NAT GW present | Often $100s/mo |
| Multi-AZ RDS in dev/staging | `multi_az = true` in non-prod | 50% on RDS |
| gp2 EBS volumes | `volume_type = "gp2"` | 20% vs gp3 |
| Data transfer cross-region | Resources in multiple regions | Varies |
| Idle/unattached EBS volumes | No EC2 attachment | 100% of volume cost |

### 🟡 Medium Impact

| Pattern | Signal | Est. Savings |
|---|---|---|
| On-Demand for steady workloads | No Savings Plans or Reserved Instances | 30–60% |
| S3 without lifecycle rules | No `lifecycle_rule` block | 20–40% on storage |
| Old S3 storage class | `STANDARD` for infrequently accessed | 40–60% on storage |
| CloudWatch logs retention | No `retention_in_days` set | Ongoing log storage |
| Oversized RDS | db.r5.2xlarge for low-traffic app | 50%+ |
| DynamoDB provisioned vs on-demand | `billing_mode = "PROVISIONED"` + low utilization | Variable |

### 🟢 Quick Wins

| Pattern | Signal | Est. Savings |
|---|---|---|
| gp2 → gp3 migration | `volume_type = "gp2"` | ~20% cheaper, same perf |
| Delete unused snapshots | Old AMIs/snapshots | 100% |
| Tag-based cost allocation | Missing `tags` in resources | Visibility only |
| S3 Intelligent-Tiering | Large buckets, mixed access | 10–30% |

---

## Step 4 — Recommendations Format

Structure all recommendations as follows:

```
## Cost Optimization Report

### Summary
- **Estimated current monthly spend**: $X (if known)
- **Estimated potential savings**: $Y/mo (Z%)
- **Top 3 quick wins**

### Finding #1: [Title]
- **Resource**: [resource name / Terraform block]
- **Current cost**: ~$X/mo
- **Recommended change**: [specific action]
- **Estimated savings**: ~$Y/mo
- **Effort**: Low / Medium / High
- **Risk**: Low / Medium / High
- **Terraform change**:
  ```hcl
  # Before
  volume_type = "gp2"
  
  # After
  volume_type = "gp3"
  iops        = 3000
  throughput  = 125
  ```

[Repeat for each finding]

### Implementation Roadmap
1. **Immediate (this week)**: [zero-risk changes]
2. **Short-term (this month)**: [low-risk changes]
3. **Planned (next quarter)**: [requires planning/testing]
```

---

## Step 5 — Terraform-Specific Guidance

When reviewing Terraform, also look for:

1. **Missing `lifecycle` rules on S3** → Add intelligent tiering or archival
2. **Hardcoded instance types** → Suggest variables with sensible defaults
3. **No spot instances for fault-tolerant workloads** → Mixed instance policies for ASGs
4. **Missing savings plans modules** → Link to AWS Compute Optimizer
5. **Environments not separated** → Same instance sizes in dev and prod

See [references/terraform-cost-mapping.md](./references/terraform-cost-mapping.md) for detailed patterns.

---

## MCP Integration

### AWS Cost Explorer MCP

If the user has the AWS Cost Explorer MCP connected, use these tool patterns:

```javascript
// Get costs by service
mcp__aws-cost-explorer__get_cost_and_usage({
  TimePeriod: { Start: "2024-01-01", End: "2024-02-01" },
  Granularity: "MONTHLY",
  GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
  Metrics: ["UnblendedCost"]
})

// Get top resources
mcp__aws-cost-explorer__get_cost_and_usage({
  TimePeriod: { Start: "2024-01-01", End: "2024-02-01" },
  Granularity: "MONTHLY",
  GroupBy: [{ Type: "DIMENSION", Key: "RESOURCE_ID" }],
  Filter: { Dimensions: { Key: "SERVICE", Values: ["Amazon EC2"] } },
  Metrics: ["UnblendedCost"]
})
```

If the MCP isn't available, tell the user how to set it up:
> "To get live cost data, you can connect the AWS Cost Explorer MCP server. 
> Run: `npx @anthropic-ai/mcp-server-aws-cost-explorer` and add it to your MCP config."

---

## Agent Behavior Notes

- Always be specific — dollar amounts beat percentages alone
- Prioritize by **savings × ease**: a 5-min gp2→gp3 change worth $50/mo beats a complex refactor worth $60/mo
- Flag non-production resources (dev/staging) as especially safe targets
- Note that Reserved Instances and Savings Plans require commitment — always flag this
- If data is limited, be explicit about what's an estimate vs confirmed
- Don't suggest changes that would break functionality without clear warnings

---

## Reference Files

- [terraform-cost-mapping.md](./references/terraform-cost-mapping.md) — Terraform resource → cost patterns
- [aws-pricing-reference.md](./references/aws-pricing-reference.md) — Key AWS service pricing (us-east-1 baseline)
- [agents/cost-analyzer.md](./agents/cost-analyzer.md) — Subagent instructions for deep cost analysis
