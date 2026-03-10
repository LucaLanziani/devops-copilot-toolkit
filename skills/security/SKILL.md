---
name: security-review
description: >
  Security review skill for analyzing infrastructure code (Terraform, Kubernetes, Docker).
  Use this skill whenever the user wants to: review security, audit infrastructure, check for
  vulnerabilities, compliance review, security hardening, or any security analysis.
  Trigger on: "security", "review security", "audit", "vulnerability", "compliance", "secure",
  "hardening", "iam policy", "security group", "encryption".
compatibility: "Optional MCP servers: filesystem (code reading), aws-security-hub (security findings)"
---

# Infrastructure Security Review Skill

A skill for analyzing infrastructure code security, identifying vulnerabilities, and providing
actionable hardening recommendations.

---

## Workflow Overview

```
1. Gather Context    → What code to review? (Terraform, K8s, Docker)
2. Identify Assets   → What resources are being created?
3. Analyze          → Check for security misconfigurations
4. Assess Risk      → Prioritize findings by severity and impact
5. Report           → Deliver structured findings with remediation
```

---

## Step 1 — Gather Context

Ask the user what they have available:

- **Terraform files**: Can be uploaded or pasted
- **Kubernetes manifests**: YAML files for K8s resources
- **Dockerfiles**: Container definitions
- **AWS resources**: Manual description of infrastructure

### MCP Tools Available

If MCP tools are connected, use:
- `mcp__filesystem__read_file` / `mcp__filesystem__list_directory`
- `mcp__aws-security-hub__get_findings` (if available)

---

## Step 2 — Identify Assets

For each resource type, map potential attack surface:

| Resource | Risk Level | Key Concerns |
|----------|------------|--------------|
| EC2/RDS | Critical | Public access, IAM roles, storage encryption |
| S3 | High | Public access, bucket policies, encryption |
| IAM | Critical | Overly permissive policies, inline policies |
| Security Groups | High | Wide-open rules, ingress from 0.0.0.0/0 |
| Lambda | High | Runtime, environment variables, VPC |
| EKS/ECS | Critical | Pod security, network policies, secrets |
| ALB/CloudFront | Medium | WAF, TLS versions, access logs |

---

## Step 3 — Analyze: Common Security Issues

### 🔴 Critical (Fix Immediately)

| Issue | Signal | Remediation |
|-------|--------|-------------|
| Public S3 bucket | `acl = "public-read"` or missing policy | Remove public access, add bucket policy |
| Overly permissive IAM | `Action: "*"`, `Resource: "*"` | Least privilege, specific actions |
| SSH key pair exposed | Hardcoded private keys | Use SSM Parameter Store or Secrets Manager |
| Database publicly accessible | `publicly_accessible = true` | Set to false, use VPC |
| Secrets in code | Hardcoded passwords, API keys | Use Secrets Manager |
| Security group any/0 | `cidr_blocks = ["0.0.0.0/0"]` for sensitive ports | Restrict to specific CIDRs |
| Unencrypted storage | Missing `encryption` or `kms_key_id` | Enable encryption |

### 🟠 High

| Issue | Signal | Remediation |
|-------|--------|-------------|
| Weak encryption | `ssl = false`, outdated TLS | Force TLS 1.2+, use modern ciphers |
| Missing VPC flow logs | No `aws_flow_log` | Enable for network monitoring |
| Overly broad SG | Too many ports open | Least privilege, specific ports |
| No MFA on root | Root account without MFA | Enable MFA |
| No deletion protection | Missing `deletion_protection` | Enable for production DBs |
| EKS public endpoint | `endpoint_public_access = true` | Disable or restrict access |

### 🟡 Medium

| Issue | Signal | Remediation |
|-------|--------|-------------|
| Missing tags | No tags for resource tracking | Add tags for cost/security tracking |
| Default VPC usage | Using default VPC | Use custom VPC with proper segmentation |
| No CloudTrail | Missing `aws_cloudtrail` | Enable for audit trail |
| Log retention too short | `retention_in_days` too low | Increase to 90+ days |
| No WAF on ALB | Missing `aws_wafv2_web_acl` | Add WAF for protection |
| Old AMI usage | Using outdated AMIs | Use latest, patched AMIs |

### 🟢 Low / Informational

| Issue | Signal | Remediation |
|-------|--------|-------------|
| Deprecated resources | Using deprecated resource types | Migrate to newer resources |
| Missing descriptions | No description on resources | Add for clarity |
| Hardcoded region | Not using variables | Use variables for flexibility |

---

## Step 4 — Risk Assessment

For each finding, assess:

1. **Severity**: Critical / High / Medium / Low
2. **Exploitability**: How easy to exploit?
3. **Impact**: What could happen if exploited?
4. **Priority**: Combine severity + exploitability + impact

### Priority Matrix

| | Low Exploitability | Medium Exploitability | High Exploitability |
|---|---|---|---|
| **Critical Impact** | High | Critical | Critical |
| **High Impact** | Medium | High | Critical |
| **Medium Impact** | Low | Medium | High |
| **Low Impact** | Low | Low | Medium |

---

## Step 5 — Report Format

Structure all findings as follows:

```markdown
## Security Review Report

### Summary
- **Critical findings**: X
- **High findings**: X
- **Medium findings**: X
- **Overall risk**: X/10

---

### Finding #1: [Title]
- **Severity**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
- **Resource**: [resource type / name]
- **File**: [.tf file location]
- **Issue**: [description of the problem]
- **Risk**: [what could happen if exploited]
- **Remediation**:
  ```hcl
  # Before (insecure)
  [insecure code]

  # After (secure)
  [secure code]
  ```
- **Priority**: P0 / P1 / P2 / P3
- **Effort**: Low / Medium / High

---

### Remediation Roadmap

1. **Immediate (P0)**: [critical findings requiring immediate action]
2. **This week (P1)**: [high findings]
3. **This sprint (P2)**: [medium findings]
4. **Backlog (P3)**: [low findings, improvements]
```

---

## Terraform-Specific Checks

### IAM Security

```hcl
# ❌ BAD - Overly permissive
resource "aws_iam_role_policy" "bad" {
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["*"]  # Never use wildcard
      Resource = "*"
    }]
  })
}

# ✅ GOOD - Least privilege
resource "aws_iam_role_policy" "good" {
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.app.arn,
        "${aws_s3_bucket.app.arn}/*"
      ]
    }]
  })
}
```

### Security Groups

```hcl
# ❌ BAD - Too open
resource "aws_security_group" "bad" {
  ingress {
    cidr_blocks = ["0.0.0.0/0"]  # Never allow all
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
  }
}

# ✅ GOOD - Restricted
resource "aws_security_group" "good" {
  ingress {
    cidr_blocks = ["10.0.0.0/8"]  # Only internal network
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
  }
}
```

### S3 Buckets

```hcl
# ❌ BAD - Public access
resource "aws_s3_bucket" "bad" {
  bucket = "my-public-bucket"
}

resource "aws_s3_bucket_acl" "bad" {
  bucket = aws_s3_bucket.bad.id
  acl    = "public-read"  # Never
}

# ✅ GOOD - Private with encryption
resource "aws_s3_bucket" "good" {
  bucket = "my-private-bucket"

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket_public_access_block" "good" {
  bucket = aws_s3_bucket.good.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

### RDS Databases

```hcl
# ❌ BAD - Not production-ready
resource "aws_db_instance" "bad" {
  identifier           = "my-db"
  engine               = "mysql"
  instance_class       = "db.t3.micro"
  publicly_accessible  = true  # Never in production
  storage_encrypted    = false # Always encrypt
  deletion_protection  = false # Enable in production
}

# ✅ GOOD - Production-ready
resource "aws_db_instance" "good" {
  identifier           = "my-db"
  engine               = "mysql"
  instance_class       = "db.t3.micro"
  publicly_accessible  = false
  storage_encrypted    = true
  deletion_protection  = true
  backup_retention     = 7
  skip_final_snapshot  = false
  final_snapshot_identifier = "my-db-final-snapshot"

  lifecycle {
    prevent_destroy = true
  }
}
```

---

## Kubernetes Security Checks

### Pod Security

```yaml
# ❌ BAD - Running as root
securityContext:
  runAsUser: 0
  runAsNonRoot: false

# ✅ GOOD - Non-root, read-only root filesystem
securityContext:
  runAsUser: 10000
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
```

### Network Policies

```yaml
# ❌ BAD - No network policy (all traffic allowed)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all

# ✅ GOOD - Explicit allow, deny default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

---

## Docker Security Checks

```dockerfile
# ❌ BAD - Using latest tag, running as root
FROM node:latest
USER root
RUN npm install -g some-package

# ✅ GOOD - Specific version, non-root user, minimal packages
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
USER node:node

# Remove unnecessary packages
RUN apk add --no-cache && rm -rf /var/cache/apk/*
```

---

## Compliance Mappings

### SOC 2
- Encryption at rest (S3, RDS, EBS)
- Encryption in transit (TLS)
- Access logging (CloudTrail, VPC Flow Logs)
- Backup and recovery

### PCI DSS
- No hardcoded credentials
- Encryption (TLS 1.2+)
- Access control
- Network segmentation

### HIPAA
- Encryption at rest and in transit
- Access controls
- Audit logging
- Business associate agreements

---

## Agent Behavior Notes

- Always prioritize critical and high findings first
- Provide specific, actionable remediation code
- Consider the context (dev vs. production)
- Flag production resources as higher priority
- Be explicit about compliance implications
- Don't recommend changes that would break functionality without warnings

---

## Reference Files

- [AWS Well-Architected - Security Pillar](https://aws.amazon.com/architecture/well-architected/security/)
- [CIS AWS Foundations Benchmark](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-cis-benchmark.html)
- [Terraform AWS Provider Security](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
