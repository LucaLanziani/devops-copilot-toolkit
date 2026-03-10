# DevOps Copilot Toolkit

A collection of AI agents and skills for DevOps engineers to provision infrastructure and review code for security and cost optimization.

## Quick Start

### Entry Point

Use `@devops-entry` as your main interface for all DevOps tasks:

- **Provision infrastructure**: "Create an ECS cluster with ALB"
- **Security review**: "Review my Terraform for security issues"
- **Cost review**: "Analyze costs and suggest optimizations"
- **CI/CD**: "Set up a GitHub Actions pipeline"

## Structure

```
devops-copilot-toolkit/
├── agents/              # AI agents for specific tasks
│   ├── entry/
│   │   ├── instructions.md   # Quick-start entry
│   │   └── devops.md        # Full orchestrator workflow
│   ├── terraform/      # Terraform development
│   ├── ci-cd/          # CI/CD pipelines
│   └── security/       # Security review
├── skills/             # Specialized AI skills
│   ├── security/       # Security review skill
│   └── finops/        # Cost optimization skill
├── prompts/           # Reusable prompt instructions
├── hooks/             # AI-powered git hooks
└── scripts/           # Utility scripts
```

## Capabilities

### Infrastructure Provisioning
Create new AWS infrastructure using Terraform:
- VPCs, networking, subnets
- Compute (EC2, ECS, EKS, Lambda)
- Databases (RDS, DynamoDB)
- Storage (S3, EFS)
- Security (IAM, Security Groups)

### Code Review

| Review Type | Trigger Keywords |
|-------------|------------------|
| Security | security, audit, vulnerability, compliance |
| FinOps | cost, pricing, optimize, expensive |

### CI/CD Pipelines
Create GitHub Actions workflows for:
- Infrastructure deployments
- Application deployments
- Testing automation

## Usage

### VS Code

```bash
# Quick-start entry
ln -s $(pwd)/agents/entry/instructions.md ~/Library/Application\ Support/Code/User/prompts/devops-entry.md

# Full orchestrator (Understand → Delegate → Deliver)
ln -s $(pwd)/agents/entry/devops.md ~/Library/Application\ Support/Code/User/prompts/devops.md
```

### GitHub Copilot

Add to your repository's `.github/copilot-instructions.md`:
```markdown
See: ../devops-copilot-toolkit/agents/entry/instructions.md
# or
See: ../devops-copilot-toolkit/agents/entry/devops.md
```

### Direct Agent Invocation

| Agent | File | Use Case |
|-------|------|----------|
| `@devops-entry` | agents/entry/instructions.md | Quick tasks |
| `@devops` | agents/entry/devops.md | Complex workflows |
| `@terraform-aws` | agents/terraform/ | AWS Terraform |
| `@github-actions` | agents/ci-cd/ | GitHub Actions |

## Skills

Skills are automatically invoked based on context:

- **security-review**: Analyzes code for vulnerabilities, provides hardening recommendations
- **finops-aws**: Analyzes costs, suggests optimizations

## Contributing

1. Create a new folder under the appropriate category
2. Include a README.md with usage instructions
3. Test your addition before committing

## Support

<a href="https://www.buymeacoffee.com/klaus82" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px; width: 217px;" />
</a>
