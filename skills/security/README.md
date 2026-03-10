# Security Review Skill

Skill for analyzing infrastructure code security and providing actionable hardening recommendations.

## Usage

This skill is invoked automatically when you mention:
- "security"
- "review security"
- "audit"
- "vulnerability"
- "compliance"
- "secure"
- "hardening"

## Features

- **Terraform analysis**: Identify security misconfigurations in IaC
- **IAM policy review**: Check for overly permissive access
- **Network security**: Analyze security groups, NACLs, VPC
- **Secrets management**: Detect hardcoded secrets, recommend solutions
- **Encryption**: Verify encryption at rest and in transit
- **Compliance mapping**: SOC2, PCI-DSS, HIPAA recommendations

## Workflow

1. Gather context (what code to review)
2. Identify assets and attack surface
3. Analyze for security issues
4. Assess risk and prioritize
5. Deliver structured report with remediation

## Files

```
security/
├── SKILL.md                    # Main skill definition
├── README.md                   # This file
├── references/                 # Additional references
│   └── ...
├── agents/                     # Sub-agents
│   └── ...
└── examples/                   # Example reports
    └── ...
```

## Integration

This skill is automatically invoked by the `devops-entry` agent for security reviews.
