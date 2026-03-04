# Copilot Toolkit

A collection of Copilot agents, prompt instructions, and AI-powered automations.

## Structure

```
copilot-toolkit/
├── agents/          # Copilot agents
├── finops-skill/    # FinOps skill and examples
├── prompts/         # Reusable prompt instructions
├── hooks/           # AI-powered git hooks
└── scripts/         # Utility scripts
```

## Getting Started

### Using Prompts

Copy or symlink instruction files from `prompts/` to your project's `.github/copilot-instructions.md` or VS Code user prompts folder:

```bash
# Symlink to VS Code user prompts
ln -s $(pwd)/prompts/example.instructions.md ~/Library/Application\ Support/Code/User/prompts/
```

### Installing Git Hooks

```bash
./scripts/install-hooks.sh /path/to/your/project
```

### Using Agents

See individual agent READMEs in `agents/<agent-name>/` for setup instructions.

## Contributing

1. Create a new folder under the appropriate category
2. Include a README.md with usage instructions
3. Test your addition before committing

## Support

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=000000)](https://www.buymeacoffee.com/klaus82)
