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

<script type="text/javascript" src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js" data-name="bmc-button" data-slug="klaus82" data-color="#FFDD00" data-emoji="☕"  data-font="Poppins" data-text="Buy me a coffee" data-outline-color="#000000" data-font-color="#000000" data-coffee-color="#ffffff" ></script>
