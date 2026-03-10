# DevOps Agents

Main entry point for DevOps engineers using the toolkit.

## Files

| File | Description |
|------|-------------|
| `instructions.md` | Quick-start entry point |
| `devops.md` | Full orchestrator with workflow |

## Usage

### Quick Start (instructions.md)
Invoke with:
```
@devops-entry
```

### Full Orchestrator (devops.md)
Invoke with:
```
@devops-orchestrator
```

Or use `/` commands:
- `/provision` - Create new infrastructure
- `/review` - Full code review (security + finops)
- `/security` - Security review only
- `/finops` - Cost review only
- `/pipeline` - CI/CD pipeline requests

## Integration

### VS Code
```bash
ln -s $(pwd)/agents/entry/instructions.md ~/Library/Application\ Support/Code/User/prompts/devops-entry.md
ln -s $(pwd)/agents/entry/devops.md ~/Library/Application\ Support/Code/User/prompts/devops-orchestrator.md
```

### GitHub Copilot
Add to `.github/copilot-instructions.md` in your repository.
