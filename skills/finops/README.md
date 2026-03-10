# AWS FinOps Skill

An AI-powered AWS cost optimization skill for analyzing Terraform infrastructure and generating actionable cost reduction recommendations. Works with **Claude** (via claude.ai Skills), **GitHub Copilot**, and any MCP-compatible AI assistant.

---

## What It Does

- Parses Terraform (`.tf`) files to inventory AWS resources
- Identifies cost waste patterns: oversized instances, missing lifecycle rules, gp2 volumes, unnecessary Multi-AZ, idle resources, and more
- Calculates estimated monthly costs and savings using current AWS pricing (us-east-1)
- Produces a prioritized report with exact before/after Terraform HCL diffs
- Integrates with the **AWS Cost Explorer MCP** for live billing data

---

## Repository Structure

```
finops-skill/
├── SKILL.md                              # Main skill — workflow, waste patterns, report format
├── agents/
│   └── cost-analyzer.md                 # Deep analysis agent instructions
└── references/
    ├── terraform-cost-mapping.md        # Terraform resource → cost patterns & red flags
    └── aws-pricing-reference.md         # AWS pricing tables (EC2, RDS, S3, NAT GW, etc.)
```

---

## Using with GitHub Copilot

### Option 1 — Reference files directly in chat

In **Copilot Chat** (VS Code, JetBrains, or GitHub.com), attach the skill files as context and ask your question:

1. Open Copilot Chat (`Ctrl+Shift+I` / `Cmd+Shift+I`)
2. Click the **paperclip / attach context** icon
3. Add these files from your workspace:
   - `finops-skill/SKILL.md`
   - `finops-skill/references/terraform-cost-mapping.md`
   - `finops-skill/references/aws-pricing-reference.md`
4. Then ask:

```
Review the attached Terraform files for AWS cost optimization opportunities.
Follow the analysis workflow in SKILL.md and use the pricing in aws-pricing-reference.md
to estimate monthly costs. Output a prioritized report with Terraform diffs.
```

### Option 2 — Use a `.github/copilot-instructions.md` file

Add a Copilot instructions file to your Terraform repo so Copilot automatically applies FinOps analysis whenever you work on `.tf` files.

Create `.github/copilot-instructions.md` in your Terraform repository:

```markdown
## FinOps Analysis

When reviewing or generating Terraform files, always apply AWS cost optimization analysis.

Reference these files from the finops-skill repository for guidance:
- [SKILL.md](../finops-skill/SKILL.md) — Workflow and waste patterns
- [terraform-cost-mapping.md](../finops-skill/references/terraform-cost-mapping.md) — Resource cost patterns
- [aws-pricing-reference.md](../finops-skill/references/aws-pricing-reference.md) — Pricing reference

For any Terraform resource, flag:
- Instance types that may be oversized
- gp2 EBS volumes (migrate to gp3)
- Multi-AZ RDS in non-production environments
- Missing S3 lifecycle rules
- Missing CloudWatch log retention policies
- On-Demand compute that should use Spot or Savings Plans

Always include estimated monthly costs and savings in your suggestions.
```

### Option 3 — Inline prompt in Copilot Chat

For a quick analysis without file setup, paste this prompt directly into Copilot Chat after opening your `.tf` file:

```
You are an AWS FinOps expert. Analyze the currently open Terraform file and:
1. Inventory all AWS resources and estimate their monthly cost (us-east-1 pricing)
2. Identify cost optimization opportunities prioritized by monthly savings
3. For each finding, show the before/after Terraform HCL and estimated savings
4. Group recommendations into: Quick Wins (this week), Short-term (this month), Strategic (next quarter)

Focus on: EC2 rightsizing, gp2→gp3 migration, Multi-AZ in non-prod, S3 lifecycle,
CloudWatch retention, NAT Gateway optimization, Spot instances, and Savings Plans.
```

---

## Using with Claude (claude.ai Skills)

Install the skill via the `.skill` file, then simply describe your infrastructure:

> *"Review my Terraform files for cost optimization"*  
> *"How much is my EKS setup costing me?"*  
> *"Is my RDS configuration wasteful?"*

The skill triggers automatically on FinOps-related queries.

---

## Linking This Repository into Another Folder

There are several ways to reference the `finops-skill/` files from a separate Terraform repository without copying them.

### Git Submodule (recommended)

Add this repo as a submodule inside your Terraform repo:

```bash
# From the root of your Terraform repository
git submodule add https://github.com/your-org/finops-skill.git .finops

# Commit the submodule reference
git add .gitmodules .finops
git commit -m "Add FinOps skill as submodule"
```

After cloning your Terraform repo elsewhere, initialize the submodule:

```bash
git clone --recurse-submodules https://github.com/your-org/your-terraform-repo.git

# Or if already cloned:
git submodule update --init --recursive
```

The skill files will be available at `.finops/` in your Terraform repo, e.g.:
- `.finops/SKILL.md`
- `.finops/references/terraform-cost-mapping.md`

### Symbolic Link (local development)

If both repos are cloned locally side by side, create a symlink:

```bash
# Linux / macOS
ln -s /path/to/finops-skill ./finops-skill

# Windows (PowerShell, run as Administrator)
New-Item -ItemType SymbolicLink -Path ".\finops-skill" -Target "C:\path\to\finops-skill"
```

Then reference files in Copilot Chat by attaching `finops-skill/SKILL.md`.

### NPM / Package (if publishing)

If you publish this skill as an npm package:

```bash
npm install @your-org/finops-skill --save-dev
```

Then reference the files at `node_modules/@your-org/finops-skill/`.

### Direct Path Reference in Copilot Instructions

If the repos live in a known relative path, reference them directly in `.github/copilot-instructions.md`:

```markdown
FinOps skill files are located at: `../../finops-skill/`
See `../../finops-skill/SKILL.md` for the analysis workflow.
See `../../finops-skill/references/terraform-cost-mapping.md` for Terraform cost patterns.
```

---

## MCP Integration (AWS Cost Explorer)

To enable **live billing data** alongside Terraform analysis:

### Setup

1. Install the AWS Cost Explorer MCP server:

```bash
npm install -g @anthropic-ai/mcp-server-aws-cost-explorer
```

2. Ensure your AWS credentials are configured:

```bash
aws configure
# Or set environment variables:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
```

3. Required IAM permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "ce:GetCostAndUsage",
    "ce:GetCostForecast",
    "ce:GetReservationUtilization",
    "ce:GetSavingsPlansUtilization",
    "ce:GetRightsizingRecommendation"
  ],
  "Resource": "*"
}
```

4. Add to your MCP config (`~/.config/claude/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "aws-cost-explorer": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-aws-cost-explorer"]
    }
  }
}
```

Once connected, the agent will automatically pull the last 3 months of costs by service and drill into the top spenders by resource ID before generating recommendations.

---

## Example Output

Running the skill on a typical production Terraform setup produces a report like:

```
Estimated current monthly spend:   ~$8,150/mo
Potential savings identified:      ~$3,700–4,400/mo (45–54%)

Top findings:
  #1  Dev RDS Multi-AZ disabled          → save ~$350/mo   (15 min, zero risk)
  #2  EC2 web tier rightsize             → save ~$420/mo   (test in staging)
  #3  ElastiCache cluster downsize       → save ~$540/mo   (profile first)
  #4  EKS Spot node group added          → save ~$420/mo   (2–4 hrs)
  #5  Compute Savings Plan (1yr)         → save ~$1,120/mo (buy in console)
```

Each finding includes before/after Terraform HCL, estimated savings calculation, effort rating, and risk level.

---

## Contributing

To add support for additional AWS services or pricing updates:

1. Update `references/terraform-cost-mapping.md` with new resource patterns
2. Update `references/aws-pricing-reference.md` with current pricing (check [aws.amazon.com/pricing](https://aws.amazon.com/pricing))
3. Add the service to the waste pattern tables in `SKILL.md`

---

## License

MIT
