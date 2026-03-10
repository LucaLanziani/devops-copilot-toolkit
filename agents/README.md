# Copilot Agents

Custom AI agents for DevOps workflows and tasks.

## Structure

Each agent should be in its own folder:

```
agents/
├── <agent-name>/
│   ├── README.md           # Usage instructions
│   ├── instructions.md     # Agent prompt
│   └── tools/              # Custom MCP tools (optional)
```

## Available Agents

### Entry Agents

| Agent | Description |
|-------|-------------|
| [entry](./entry/) | Main entry point - START HERE |

### Terraform

| Agent | Description |
|-------|-------------|
| [terraform-aws](./terraform/) | AWS infrastructure development |
| [terraform-test](./terraform/) | Terraform testing and validation |

### CI/CD

| Agent | Description |
|-------|-------------|
| [github-actions](./ci-cd/) | GitHub Actions workflows |

### Orchestration

| Agent | Description |
|-------|-------------|
| [devops-orchestrator](./devops-orchestrator.md) | Legacy orchestrator |

## Creating a New Agent

1. Create a new folder with the agent name
2. Add an `instructions.md` with the agent's system prompt
3. Add a `README.md` explaining the agent's purpose and usage

## Usage

Invoke agents using `@agent-name` in your AI assistant.
