---
name:terraform-aws
description: This document provides comprehensive guidelines for autonomous development terraform agents for AWS. Follow these instructions precisely to ensure consistency, quality, and maintainability.
---

# Agent development guidelines for AWS Infrastructure

## Project Overview

### Technology Stack

- **Cloud provider**: AWS
- **Infrastructure as Code**: Terraform

### Entry Point

The  entry point is `infra/main.ts`, which:
- All the infrastructure provisioning starts here
- Initializes Terraform and AWS SDK clients
- Defines the main infrastructure components and resources

**CRITICAL**: Never modify the entry point unless explicitly required for provider configuration or polyfill changes

## Project Architecture

### Directory Structure

- `infra/`: Contains all infrastructure-related code
  - `main.ts`: Entry point for infrastructure provisioning
  - `modules/`: Reusable Terraform modules for different infrastructure components
  - `src/env`: Environment-specific configurations (e.g., dev, staging, prod)
  - `scripts/`: Utility scripts for deployment and management tasks

## Environment Management
- Use the `src/env` directory to manage different deployment environments.
- Each environment has its own folder and `tfvars.json` file.
- Ensure that any changes to environment configurations are reflected in the corresponding `tfvars.json` files.
- there are 5 environments: `dev`, `test`, `uat`, `preprod`, `prod`. The order of environments is important and must be preserved.

## Terraform Coding Standards

### File Organization

**Required files in all modules:**

| File | Purpose |
|------|---------|
| `main.tf` | Resource definitions, module calls, data sources |
| `variables.tf` | Input variable declarations |
| `outputs.tf` | Output value declarations |
| `versions.tf` | Provider and Terraform version constraints |
| `README.md` | Usage documentation |

**Conditional files:**

| File | When to Use |
|------|-------------|
| `locals.tf` | For complex local value calculations |
| `data.tf` | When `main.tf` gets large (separate data sources) |
| `backend.tf` | Only at composition level (remote state config) |
| `terraform.tfvars` | Only at composition level (never in modules) |

### Block Ordering & Structure

#### Resource Block Structure

Arguments must follow this strict ordering:

1. `count` or `for_each` FIRST (blank line after)
2. Other arguments (alphabetical or logical grouping)
3. `tags` as last real argument
4. `depends_on` after tags (if needed)
5. `lifecycle` at the very end (if needed)

```hcl
# ✅ GOOD - Correct ordering
resource "aws_nat_gateway" "this" {
  count = var.create_nat_gateway ? 1 : 0

  allocation_id = aws_eip.this[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name        = "${var.name}-nat"
    Environment = var.environment
  }

  depends_on = [aws_internet_gateway.this]

  lifecycle {
    create_before_destroy = true
  }
}
```

#### Variable Block Structure

Variable blocks must follow this ordering:

1. `description` (ALWAYS required)
2. `type`
3. `default`
4. `sensitive` (when setting to true)
5. `nullable` (when setting to false)
6. `validation`

```hcl
variable "environment" {
  description = "Environment name for resource tagging"
  type        = string
  default     = "dev"
  nullable    = false

  validation {
    condition     = contains(["dev", "test", "uat", "preprod", "prod"], var.environment)
    error_message = "Environment must be one of: dev, test, uat, preprod, prod."
  }
}
```

### Naming Conventions

#### Core Principles

All identifiers use underscores (`_`), never hyphens (`-`)
No resource names repeat resource type (no `aws_vpc.main_vpc`)
Single-instance resources named `this` or descriptive name
Variables have plural names for lists/maps (`subnet_ids` not `subnet_id`)
All variables must have descriptions
All outputs must have descriptions
No double negatives in variable names

#### Resource Naming

Use descriptive, contextual names:

```hcl
# ✅ GOOD - Descriptive and contextual
resource "aws_instance" "web_server" { }
resource "aws_s3_bucket" "application_logs" { }
resource "aws_security_group" "database" { }
resource "aws_iam_role" "ecs_task_execution" { }

# ❌ BAD - Generic or redundant
resource "aws_instance" "main" { }
resource "aws_s3_bucket" "bucket" { }
resource "aws_security_group" "sg" { }  # Redundant
```

#### Variable Naming

Use context-specific names, not generic ones:

```hcl
# ✅ GOOD - Context-specific
var.vpc_cidr_block
var.database_instance_class
var.application_port
var.enable_nat_gateway
var.private_subnet_ids
var.rds_backup_retention_days

# ❌ BAD - Generic names
var.name
var.type
var.value
var.cidr
var.enabled
```

#### Output Naming

Pattern: `{name}_{type}_{attribute}` (omit "this_" prefix)

```hcl
# ✅ GOOD
output "security_group_id" {
  description = "The ID of the security group"
  value       = try(aws_security_group.this[0].id, "")
}

output "private_subnet_ids" {  # Plural for lists
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "vpc_arn" {
  description = "ARN of the VPC"
  value       = aws_vpc.this.arn
}

# ❌ BAD
output "this_security_group_id" {  # Don't prefix with "this_"
  value = aws_security_group.this[0].id
}

output "subnet_id" {  # Should be plural "subnet_ids"
  value = aws_subnet.private[*].id  # Returns list
}
```

#### Module Naming

**Public modules** (Terraform Registry):
```
terraform-<PROVIDER>-<NAME>

Examples:
terraform-aws-vpc
terraform-aws-eks
terraform-google-network
```

**Private modules** (internal use):
```
<ORG>-terraform-<PROVIDER>-<NAME>

Examples:
mine-terraform-aws-vpc
mine-terraform-aws-rds
```

## Modularization Strategies

### Module Hierarchy

Terraform modules should be organized into three distinct types:

#### 1. Resource Module
- **Purpose**: Smallest building block, single logical group of resources
- **Characteristics**: Highly reusable, minimal dependencies, focused purpose
- **Examples**: VPC module, security group module, RDS module
- **Location**: `infra/modules/resource-name/`

```hcl
# Example: modules/vpc/
modules/vpc/
├── main.tf        # VPC + subnets + route tables
├── variables.tf
├── outputs.tf
├── versions.tf
└── README.md
```

#### 2. Infrastructure Module
- **Purpose**: Combines multiple resource modules for a specific purpose
- **Characteristics**: Purpose-specific, moderate reusability, region or account-specific
- **Examples**: Complete web application infrastructure
- **Location**: `infra/modules/infrastructure-name/`

```hcl
# Example: modules/web-application/
module "vpc" {
  source = "../vpc"
}

module "alb" {
  source = "../alb"
  vpc_id = module.vpc.vpc_id
}

module "ecs" {
  source     = "../ecs"
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
}
```

#### 3. Composition
- **Purpose**: Complete environment or application deployment
- **Characteristics**: Environment-specific, not reusable, combines infrastructure modules
- **Examples**: dev, staging, prod environments
- **Location**: `infra/src/env/<environment>/`

```hcl
# Example: src/env/prod/
environments/prod/
├── main.tf            # Complete production environment
├── backend.tf         # Remote state configuration
├── terraform.tfvars   # Production-specific values
├── variables.tf
└── versions.tf
```

### Module Decision Tree

```
Question 1: Is this environment-specific configuration?
├─ YES → Composition (src/env/prod/, src/env/dev/)
└─ NO  → Continue

Question 2: Does it combine multiple infrastructure concerns?
├─ YES → Infrastructure Module (modules/web-application/)
└─ NO  → Continue

Question 3: Is it a focused group of related resources?
└─ YES → Resource Module (modules/vpc/, modules/rds/)
```

### Module Best Practices

#### Keep Resource Modules Simple

**DON'T** hardcode values:
```hcl
# ❌ BAD - Hardcoded values
resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.large"
  subnet_id     = "subnet-12345678"
}
```

**DO** parameterize everything:
```hcl
# ✅ GOOD - Parameterized
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_instance" "web" {
  ami           = var.ami_id != "" ? var.ami_id : data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = var.subnet_id
  tags          = var.tags
}
```

#### Use terraform_remote_state as Glue

Connect compositions via remote state data sources:

```hcl
# src/env/prod/networking/outputs.tf
output "vpc_id" {
  description = "ID of the production VPC"
  value       = aws_vpc.this.id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

# src/env/prod/compute/main.tf
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "mine-terraform-state"
    key    = "prod/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

module "ec2" {
  source = "../../../modules/ec2"

  vpc_id     = data.terraform_remote_state.networking.outputs.vpc_id
  subnet_ids = data.terraform_remote_state.networking.outputs.private_subnet_ids
}
```

#### Smaller Scopes = Better Performance

**Benefits:**
- Faster `terraform plan` and `terraform apply`
- Isolated failures don't affect unrelated infrastructure
- Easier to reason about changes
- Parallel development by multiple teams

```hcl
# ❌ BAD - One massive composition
environments/prod/
  main.tf  # 2000 lines, everything in one file
  # Takes 10+ minutes to plan
  # One mistake affects entire infrastructure

# ✅ GOOD - Separated by concern
environments/prod/
  networking/     # VPC, subnets, route tables
  compute/        # EC2, ASG, ALB
  data/           # RDS, ElastiCache
  storage/        # S3, EFS
  iam/            # IAM roles, policies
```

#### Always Version Your Modules

```hcl
# Production - pin exact version
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"  # Exact version for stability
}

# Development - allow patch updates
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.1"
}
```

### Architecture Principles

1. **Always use remote state** - Prevents race conditions, enables collaboration
2. **Use terraform_remote_state for cross-stack dependencies** - Loose coupling
3. **Keep resource modules focused** - Single responsibility principle
4. **Composition layer has environment-specific values only** - Not business logic

## Documentation Standards

### README.md Requirements

Every module MUST have a README.md with the following sections:

#### 1. Module Description
Clear, concise explanation of what the module does and its purpose.

#### 2. Usage Example
Working code example showing how to use the module:

```markdown
## Usage

```hcl
module "vpc" {
  source = "../../modules/vpc"

  cidr_block         = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true

  tags = {
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}
```
```

#### 3. Requirements Table
Document Terraform version and provider requirements:

```markdown
## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.9.0 |
| aws | >= 5.0 |
```

#### 4. Inputs Documentation
Complete table of all input variables with descriptions, types, and defaults:

```markdown
## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| vpc_cidr_block | CIDR block for VPC | `string` | `"10.0.0.0/16"` | no |
| availability_zones | List of availability zones | `list(string)` | n/a | yes |
| enable_nat_gateway | Enable NAT Gateway for private subnets | `bool` | `true` | no |
| tags | Tags to apply to all resources | `map(string)` | `{}` | no |
```

#### 5. Outputs Documentation
Complete table of all outputs with descriptions:

```markdown
## Outputs

| Name | Description |
|------|-------------|
| vpc_id | ID of the VPC |
| vpc_arn | ARN of the VPC |
| private_subnet_ids | List of private subnet IDs |
| public_subnet_ids | List of public subnet IDs |
| nat_gateway_ids | List of NAT Gateway IDs |
```

#### 6. Examples Section
Link to or include multiple usage examples:

```markdown
## Examples

- [Simple Example](./examples/simple) - Minimal configuration
- [Complete Example](./examples/complete) - Full-featured configuration
```

#### 7. Authors and License
Credit authors and specify license (for public modules):

```markdown
## Authors

Created by MINE Infrastructure Team

## License

Licensed under Apache 2.0. See LICENSE file for details.
```

### Inline Comments Standards

#### When to Comment

**DO comment:**
- Complex business logic that isn't obvious
- Why a specific value or pattern was chosen
- Workarounds for provider limitations
- Dependencies that aren't clear from code

**DON'T comment:**
- Obvious code (what the code does is clear)
- Redundant descriptions of Terraform syntax
- Commented-out code (use version control)

#### Comment Style

**Only use `#` for comments** (never `//` or `/* */`):

```hcl
# ✅ GOOD - Clear, explains WHY
# Use t3.micro in non-production to reduce costs
# Production requires t3.large for performance SLA
instance_type = var.environment == "prod" ? "t3.large" : "t3.micro"

# ✅ GOOD - Explains workaround
# Explicit depends_on needed due to AWS API eventual consistency
# Without this, security group rules may fail on first apply
depends_on = [aws_security_group.this]

# ❌ BAD - States the obvious
# Create an S3 bucket
resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name  # Set the bucket name
}
```

#### Multi-line Comments for Complex Logic

```hcl
# This CIDR calculation ensures:
# 1. No overlap with existing VPCs (10.0.0.0/8 range)
# 2. /24 subnets for 254 hosts per subnet
# 3. Alignment with AWS availability zones (3 AZs)
locals {
  subnet_cidrs = [
    for idx in range(3) : cidrsubnet(var.vpc_cidr, 8, idx)
  ]
}
```

### Variable Documentation Standards

Every variable MUST include:

1. **description** - Clear explanation of purpose
2. **type** - Explicit type constraint
3. **default** - Default value (if applicable)
4. **validation** - Validation rules (when constraints needed)

```hcl
variable "environment" {
  description = "Environment name for resource tagging. Must be one of the standard MINE environments."
  type        = string
  nullable    = false

  validation {
    condition     = contains(["dev", "test", "uat", "preprod", "prod"], var.environment)
    error_message = "Environment must be one of: dev, test, uat, preprod, prod."
  }
}

variable "backup_retention_days" {
  description = "Number of days to retain backups. Production requires minimum 7 days per compliance policy."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 35
    error_message = "Backup retention must be between 1 and 35 days."
  }
}

variable "database_config" {
  description = "Database configuration settings. Optional fields use sensible defaults."
  type = object({
    name               = string
    engine             = string
    instance_class     = string
    allocated_storage  = number
    backup_retention   = optional(number, 7)
    multi_az           = optional(bool, false)
    monitoring_enabled = optional(bool, true)
    tags               = optional(map(string), {})
  })
}
```

### Output Documentation Standards

Every output MUST include:

1. **description** - Clear explanation of what is output
2. **value** - The value being output
3. **sensitive** - Set to true for secrets (optional, false by default)

```hcl
output "vpc_id" {
  description = "ID of the created VPC. Use this to reference the VPC in other modules."
  value       = aws_vpc.this.id
}

output "database_connection_string" {
  description = "Database connection string. Contains sensitive credentials."
  value       = "postgresql://${aws_db_instance.this.username}:${aws_db_instance.this.password}@${aws_db_instance.this.endpoint}"
  sensitive   = true
}

output "subnet_details" {
  description = "Complete details of all subnets including IDs, CIDRs, and availability zones."
  value = {
    private = {
      ids   = aws_subnet.private[*].id
      cidrs = aws_subnet.private[*].cidr_block
      azs   = aws_subnet.private[*].availability_zone
    }
    public = {
      ids   = aws_subnet.public[*].id
      cidrs = aws_subnet.public[*].cidr_block
      azs   = aws_subnet.public[*].availability_zone
    }
  }
}
```

### Examples Directory Structure

Every module should include an `examples/` directory:

```
modules/vpc/
├── main.tf
├── variables.tf
├── outputs.tf
├── versions.tf
├── README.md
└── examples/
    ├── simple/
    │   ├── main.tf           # Minimal configuration
    │   ├── variables.tf
    │   ├── outputs.tf
    │   └── README.md
    └── complete/
        ├── main.tf           # Full-featured example
        ├── variables.tf
        ├── outputs.tf
        └── README.md
```

Examples should:
- Be fully functional and tested
- Show realistic use cases
- Include clear README explaining the example
- Use `terraform_remote_state` to show integration patterns

## Count vs For_Each

- Simple boolean conditions (create or don't):
  ```hcl
  resource "aws_nat_gateway" "this" {
    count = var.create_nat_gateway ? 1 : 0
  }
  ```

#### Use `for_each` for:

- Collections where items may be added/removed:
  ```hcl
  resource "aws_subnet" "private" {
    for_each = toset(var.availability_zones)

    vpc_id            = aws_vpc.this.id
    availability_zone = each.key
  }
  # Reference: aws_subnet.private["us-east-1a"]
  ```

**Why?** Removing an item from `count` list reshuffles all subsequent resources. `for_each` only affects the specific resource being removed.

### Modern Terraform Features

#### Use `try()` instead of legacy patterns

```hcl
# ✅ GOOD - Modern try() function
output "security_group_id" {
  value = try(aws_security_group.this[0].id, "")
}

# ❌ BAD - Legacy pattern
output "security_group_id" {
  value = element(concat(aws_security_group.this.*.id, [""]), 0)
}
```

#### Use `optional()` for object attributes (Terraform 1.3+)

```hcl
variable "database_config" {
  description = "Database configuration with optional parameters"
  type = object({
    name             = string
    engine           = string
    instance_class   = string
    backup_retention = optional(number, 7)
    tags             = optional(map(string), {})
  })
}
```

### Version Constraints

```hcl
# versions.tf
terraform {
  required_version = "~> 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

### Anti-patterns to Avoid

| Anti-pattern | Problem | Solution |
|--------------|---------|----------|
| Hard-coded values in modules | Module locked to one environment | Make everything configurable via variables |
| God modules (do everything) | Hard to test, reuse, maintain | Break into focused resource modules |
| `count` for dynamic collections | Removing items recreates subsequent resources | Use `for_each` instead |
| Secrets in state | Security risk | Use write-only arguments or external secret management |
| No remote state | No collaboration, no locking | Always use S3 + DynamoDB for state |

### Common Patterns

#### Use Locals for Computed Values

```hcl
locals {
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  )
}

resource "aws_instance" "app" {
  tags = local.common_tags
}
```

#### Always Version Your Modules

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
}
```

## Version Control Practices

### State File Management

#### Always Use Remote State

**Critical**: Never use local state files in production or team environments.

```hcl
# backend.tf - Configuration for remote state
terraform {
  backend "s3" {
    bucket         = "mine-terraform-state"
    key            = "prod/networking/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"  # State locking
    encrypt        = true                # Encryption at rest
  }
}
```

**Benefits:**
- Prevents race conditions with multiple developers
- Provides disaster recovery (state versioning)
- Enables team collaboration (shared access)
- Supports state locking (prevents concurrent modifications)

#### State File Organization

Organize state files by:
1. Environment (dev, test, uat, preprod, prod)
2. Component (networking, compute, data, storage)

```
S3 Structure:
mine-terraform-state/
├── dev/
│   ├── networking/terraform.tfstate
│   ├── compute/terraform.tfstate
│   └── data/terraform.tfstate
├── test/
│   ├── networking/terraform.tfstate
│   └── compute/terraform.tfstate
└── prod/
    ├── networking/terraform.tfstate
    ├── compute/terraform.tfstate
    └── data/terraform.tfstate
```

### Git Workflow for Infrastructure

#### Branch Strategy

- **main** - Production-ready code, protected branch
- **develop** - Integration branch for development
- **feature/** - Feature branches (feature/add-rds-module)
- **hotfix/** - Emergency production fixes

#### Required Files in Git

**MUST commit:**
- All `.tf` files (main.tf, variables.tf, outputs.tf, versions.tf, backend.tf)
- README.md documentation
- .terraform.lock.hcl (lock file for provider versions)
- .gitignore
- .pre-commit-config.yaml (if using pre-commit hooks)
- LICENSE (for public modules)
- examples/ directory

**MUST NOT commit:**
- `.terraform/` directory (providers cache)
- `*.tfstate` files (sensitive data, managed remotely)
- `*.tfstate.backup` files
- `*.tfvars` files (may contain secrets)
- `*.tfplan` files (plan output)
- `.env` files
- Secrets, API keys, passwords

#### Standard .gitignore for Terraform

```gitignore
# .gitignore - Terraform/OpenTofu projects

# Local .terraform directories
**/.terraform/*

# .terraform.lock.hcl - COMMIT THIS FILE
# (Commented out to ensure it's tracked)
# .terraform.lock.hcl

# .tfstate files - NEVER commit state files
*.tfstate
*.tfstate.*

# Crash log files
crash.log
crash.*.log

# Exclude all .tfvars files (may contain sensitive data)
*.tfvars
*.tfvars.json

# Ignore override files (local development)
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# CLI configuration files
.terraformrc
terraform.rc

# Environment variables and secrets
.env
.env.*
secrets/
*.secret
*.pem
*.key

# IDE and editor files
.idea/
.vscode/
*.swp
*.swo
*~
.DS_Store

# Terraform plan output files
*.tfplan
*.tfplan.json
```

### Version Management Strategy

#### Constraint Syntax

| Constraint | Meaning | Use Case |
|------------|---------|----------|
| `"5.0.0"` | Exact version | Avoid (inflexible) |
| `"~> 5.0"` | Pessimistic (5.0.x) | **Recommended for stability** |
| `"~> 5.0.1"` | Pessimistic (5.0.x where x >= 1) | Specific patch minimum |
| `">= 5.0, < 6.0"` | Range | Any 5.x version |
| `">= 5.0"` | Minimum | Risky (breaking changes) |

#### Strategy by Component

| Component | Strategy | Example |
|-----------|----------|---------|
| Terraform | Pin minor, allow patch | `required_version = "~> 1.9"` |
| Providers | Pin major, allow minor/patch | `version = "~> 5.0"` |
| Modules (prod) | Pin exact version | `version = "5.1.2"` |
| Modules (dev) | Allow patch updates | `version = "~> 5.1"` |

#### Update Workflow

```bash
# Step 1: Lock versions initially
terraform init              # Creates .terraform.lock.hcl

# Step 2: Update to latest within constraints
terraform init -upgrade     # Updates providers

# Step 3: Review changes
terraform plan

# Step 4: Commit lock file
git add .terraform.lock.hcl
git commit -m "chore: update provider versions"
```

#### Update Strategy by Type

**Security patches:**
- Update immediately
- Test: dev → test → uat → preprod → prod
- Prioritize Terraform core and provider updates

**Minor versions:**
- Regular maintenance (monthly/quarterly)
- Review changelog for breaking changes
- Test thoroughly before production

**Major versions:**
- Planned upgrade cycles
- Dedicated testing period
- May require code changes
- Phased rollout: dev → test → uat → preprod → prod

### Pre-Commit Checklist

Run these before every commit:

#### Formatting & Validation
```bash
# Format all Terraform files
terraform fmt -recursive

# Validate configuration
terraform validate

# Lint (optional but recommended)
tflint --init && tflint

# Security scanning (optional but recommended)
checkov -d .
```

#### Code Structure Review
- [ ] `count`/`for_each` at top of resource blocks (blank line after)
- [ ] `tags` as last real argument in resources
- [ ] `depends_on` after tags (if used)
- [ ] `lifecycle` at end of resource (if used)
- [ ] Variables ordered: description → type → default → sensitive → nullable → validation
- [ ] Only `#` comments used (no `//` or `/* */`)

#### Naming Convention Review
- [ ] All identifiers use `_` not `-`
- [ ] No resource names repeat resource type (no `aws_vpc.main_vpc`)
- [ ] Single-instance resources named `this` or descriptive name
- [ ] Variables have plural names for lists/maps (`subnet_ids` not `subnet_id`)
- [ ] All variables have descriptions
- [ ] All outputs have descriptions
- [ ] Output names follow `{name}_{type}_{attribute}` pattern
- [ ] No double negatives in variable names

#### Documentation Check
- [ ] README.md exists with usage examples
- [ ] All variables documented in README
- [ ] All outputs documented in README
- [ ] Version requirements specified
- [ ] Examples provided

#### Modern Features Check
- [ ] Using `try()` not `element(concat())`
- [ ] Secrets use write-only arguments or external data sources (not in state)
- [ ] `nullable = false` set on non-null variables
- [ ] `optional()` used in object types where applicable (Terraform 1.3+)
- [ ] Variable validation blocks added where constraints needed

#### Architecture Review
- [ ] `terraform.tfvars` only at composition level (not in modules)
- [ ] Remote state configured (never local state)
- [ ] Resource modules don't hardcode values (use variables/data sources)
- [ ] `terraform_remote_state` used for cross-composition dependencies
- [ ] File structure follows standard: main.tf, variables.tf, outputs.tf, versions.tf

### Pull Request Guidelines

#### PR Title Format
```
<type>(<scope>): <description>

Examples:
feat(vpc): add NAT gateway support
fix(rds): correct backup retention validation
docs(readme): update usage examples
refactor(modules): migrate count to for_each
chore(deps): update AWS provider to 5.70.0
```

#### PR Description Template
```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] Refactoring
- [ ] Dependency update

## Changes Made
- Detailed list of changes
- With context and reasoning

## Testing
- [ ] terraform fmt completed
- [ ] terraform validate passed
- [ ] terraform plan reviewed
- [ ] Tested in dev environment
- [ ] Documentation updated

## Checklist
- [ ] Code follows project style guidelines
- [ ] All variables have descriptions
- [ ] All outputs have descriptions
- [ ] README updated if needed
- [ ] Examples updated if needed
- [ ] No secrets committed
- [ ] .terraform.lock.hcl committed
```

#### Review Process
1. Automated checks must pass (formatting, validation, linting)
2. At least one peer review required
3. `terraform plan` output must be reviewed
4. Test in lower environment (dev/test) before merging
5. Production changes require approval from team lead

### Commit Message Guidelines

Follow conventional commits format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(vpc): add support for IPv6 CIDR blocks

Add variables and resources to support IPv6 addressing in VPC module.
Includes validation for IPv6 CIDR format.

Closes #123

---

fix(rds): correct backup retention period validation

The validation was allowing values outside AWS supported range.
Changed to enforce 1-35 day range per AWS documentation.

---

docs(readme): add examples for multi-AZ RDS deployment

Added complete example showing production-ready RDS configuration
with multi-AZ, automated backups, and monitoring enabled.

---

chore(deps): update AWS provider from 5.60 to 5.70

This update includes security fixes and new resource support.
All existing functionality tested and working.
```

### Module Versioning

For reusable modules, follow semantic versioning (SemVer):

```
MAJOR.MINOR.PATCH

Examples:
1.0.0 - Initial release
1.0.1 - Patch: Bug fix, no breaking changes
1.1.0 - Minor: New feature, backwards compatible
2.0.0 - Major: Breaking change
```

#### When to Increment

**MAJOR (breaking change):**
- Removing input variables
- Changing variable types
- Removing outputs
- Changing default behaviors significantly

**MINOR (new feature):**
- Adding new input variables (with defaults)
- Adding new outputs
- Adding new optional functionality

**PATCH (bug fix):**
- Bug fixes
- Documentation updates
- Internal refactoring (no external changes)

#### Tagging Releases

```bash
# Create and push a new version tag
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0

# View all tags
git tag -l

# Use specific version in module
module "vpc" {
  source = "git::https://github.com/mine/terraform-aws-vpc.git?ref=v1.2.0"
}
```

### CHANGELOG Maintenance

Maintain a CHANGELOG.md for all modules:

```markdown
# Changelog

All notable changes to this module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features not yet released

## [1.2.0] - 2025-01-30

### Added
- Support for IPv6 CIDR blocks
- New `ipv6_cidr_block` variable
- New `ipv6_cidr_block_association` output

### Changed
- Updated AWS provider minimum version to 5.0
- Improved validation for CIDR block formats

### Fixed
- Corrected NAT Gateway dependency order

## [1.1.0] - 2025-01-15

### Added
- Support for custom NAT Gateway EIP tags
- New `nat_gateway_tags` variable

### Changed
- Updated documentation with more examples

## [1.0.0] - 2025-01-01

### Added
- Initial release
- VPC creation with customizable CIDR
- Public and private subnets
- NAT Gateway support
- Internet Gateway
- Route tables
```

## Testing and Validation

### Pre-Deployment Testing

Before applying changes to any environment:

```bash
# 1. Format check
terraform fmt -check -recursive

# 2. Validation
terraform validate

# 3. Plan and review
terraform plan -out=tfplan

# 4. Review plan output carefully
terraform show tfplan

# 5. Check for unexpected changes
# Look for:
# - Resources being destroyed unexpectedly
# - Changes to critical resources
# - Security group or IAM modifications
```

### Testing Strategy

**Unit Testing:**
- Variable validation logic
- Local value calculations
- Conditional resource creation

**Integration Testing:**
- Apply in dev environment
- Verify resources created correctly
- Test connections between resources
- Verify outputs are correct

**Idempotency Testing:**
```bash
# Apply once
terraform apply -auto-approve

# Run plan again - should show no changes
terraform plan -detailed-exitcode
# Exit code 0 = no changes (idempotent) ✓
# Exit code 2 = changes detected (not idempotent) ✗
```

### Post-Deployment Validation

After applying changes:

```bash
# 1. Verify state is consistent
terraform plan
# Should show: No changes. Your infrastructure matches the configuration.

# 2. Test resource functionality
# Use AWS CLI or application tests to verify resources work correctly

# 3. Check monitoring and alerts
# Ensure CloudWatch alarms and dashboards functioning

# 4. Document changes
# Update runbooks, team wiki, or internal documentation
```

## Security Best Practices

### Secrets Management

**NEVER commit secrets to Git:**
- No passwords in variables
- No API keys in .tfvars files
- No certificates in repository

**Use AWS Secrets Manager or Parameter Store:**
```hcl
# ✅ GOOD - Fetch from AWS Secrets Manager
data "aws_secretsmanager_secret" "db_password" {
  name = "prod-database-password"
}

data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = data.aws_secretsmanager_secret.db_password.id
}

resource "aws_db_instance" "this" {
  # Use write-only argument (Terraform 1.11+)
  password_wo = data.aws_secretsmanager_secret_version.db_password.secret_string
}

# ❌ BAD - Secret in variable
variable "db_password" {
  type      = string
  sensitive = true  # Still ends up in state!
}
```

### State File Security

State files contain sensitive data:

```hcl
# backend.tf - Enable encryption
terraform {
  backend "s3" {
    bucket         = "mine-terraform-state"
    key            = "prod/networking/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true              # Encryption at rest
    dynamodb_table = "terraform-locks"
    
    # Enable versioning on S3 bucket
    # Enable MFA delete on S3 bucket
    # Restrict access with IAM policies
  }
}
```

**S3 Bucket Configuration:**
- Enable versioning (disaster recovery)
- Enable encryption at rest
- Enable MFA delete for production
- Use restrictive bucket policies
- Enable access logging

### IAM and Access Control

```hcl
# Use least privilege principle
resource "aws_iam_role_policy" "this" {
  name = "${var.name}-policy"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.this.arn,
          "${aws_s3_bucket.this.arn}/*"
        ]
      }
    ]
  })
}
```

**Best Practices:**
- Use IAM roles instead of access keys
- Apply least privilege principle
- Use AWS managed policies when appropriate
- Document why specific permissions are needed
- Regularly audit IAM permissions

---

## References and Best Practices

This agent follows best practices from:
- [terraform-skill by Anton Babenko](https://github.com/antonbabenko/terraform-skill)
- [Terraform Best Practices](https://terraform-best-practices.com)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

For detailed patterns and advanced topics, refer to:
- [Module Development Patterns](https://github.com/antonbabenko/terraform-skill/blob/master/references/module-patterns.md)
- [Code Patterns & Structure](https://github.com/antonbabenko/terraform-skill/blob/master/references/code-patterns.md)
- [Quick Reference Guide](https://github.com/antonbabenko/terraform-skill/blob/master/references/quick-reference.md)