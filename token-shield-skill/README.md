# Token Shield

> Compress configs, manifests, and logs before sending them to an LLM — reducing token usage and cost without losing signal.

Token Shield is a Copilot skill and CLI toolkit that applies a multi-step compression pipeline to DevOps content (Kubernetes manifests, Terraform files, CloudFormation templates, JSON configs, and application logs) before it reaches the model context window.

---

## How it works

```
Input
  │
  ├─[YAML/JSON/HCL/MD]──▶ Minify ──▶ TOON ──▶ Dedup ──▶ Output
  │
  └─[Logs]──────────────▶ Distill ──────────▶ Dedup ──▶ Output
                                                            │
                                                     Shield Report
                                              (tokens saved, cost delta)
```

| Step | What it does |
|---|---|
| **Minify** | Strips comments, blank lines, and excess whitespace. Round-trips YAML/JSON through the parser — structure is guaranteed identical. |
| **TOON** | Replaces ~80 verbose DevOps keys and values with short abbreviations (`namespace→ns`, `containers→ctrs`, `imagePullPolicy→imgPull` …). |
| **Distill** | Normalises variable log parts (UUIDs, IPs, numbers, timestamps) to detect structural duplicates, then collapses them with a `[×N]` count. `ERROR`/`CRITICAL`/`FATAL` lines are always preserved verbatim. |
| **Dedup** | Removes exact duplicate lines as a final pass, with optional multi-line block mode. |

---

## Files

```
token-shield-skill/
├── SKILL.md                   # Copilot skill manifest (activation rules, constraints)
├── README.md                  # This file
└── scripts/
    ├── compress.py            # Unified CLI — runs the full pipeline
    ├── minify_config.py       # Step 1: comment & whitespace removal
    ├── toon_converter.py      # Step 2: key/value abbreviation
    ├── log_distiller.py       # Step 3 (logs): pattern deduplication
    ├── deduplicator.py        # Step 4: exact-line/block deduplication
    ├── token_counter.py       # Token estimation + cost report
    └── abbreviations.json     # TOON abbreviation map
```

---

## Requirements

```bash
pip install pyyaml        # required for YAML input
pip install tiktoken      # optional — improves token counting accuracy
```

Without `tiktoken`, the counter falls back to a `1 token ≈ 4 chars` heuristic.

---

## CLI usage

### Compress a file

```bash
# Format is auto-detected from the file extension
python scripts/compress.py manifest.yaml
python scripts/compress.py main.tf
python scripts/compress.py config.json

# Logs (stdin or file)
python scripts/compress.py app.log --format log
cat app.log | python scripts/compress.py --format log
```

Compressed content → **stdout**  
Shield Report → **stderr**

```bash
# Capture separately
python scripts/compress.py manifest.yaml > compressed.yaml 2>report.txt
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--format` | `auto` | `yaml`, `json`, `hcl`, `md`, `log` |
| `--model` | `gpt-4o` | Model name for cost estimates |
| `--skip` | — | Skip pipeline steps: `minify`, `toon`, `dedup`, `distill` |
| `--no-report` | — | Suppress the Shield Report |
| `--report-only` | — | Print only the Shield Report (no compressed output) |

```bash
# Target a specific model for pricing
python scripts/compress.py config.yaml --model claude-3.7-sonnet

# Keep original key names (skip TOON)
python scripts/compress.py manifest.yaml --skip toon

# Skip multiple steps
python scripts/compress.py manifest.yaml --skip toon dedup
```

### Count tokens only

```bash
# Single file
python scripts/token_counter.py manifest.yaml

# Before/after comparison
python scripts/token_counter.py --compare original.yaml compressed.yaml

# As JSON (for scripting)
python scripts/token_counter.py --json manifest.yaml
```

### Run individual steps

```bash
# Minify only
python scripts/minify_config.py main.tf

# TOON abbreviation only
python scripts/toon_converter.py manifest.yaml

# Distil a log file
python scripts/log_distiller.py app.log

# Deduplicate any text
python scripts/deduplicator.py output.txt
python scripts/deduplicator.py --chunk-size 5 terraform.plan  # 5-line blocks
```

---

## Shield Report

```
╔══════════════════════════════════════════════════════╗
║              TOKEN SHIELD  ·  Shield Report          ║
╠══════════════════════════════════════════════════════╣
║  Format       : yaml                                 ║
║  Pipeline     : minify → toon → dedup                ║
╠══════════════════════════════════════════════════════╣
║  Chars    12,450 →  7,890   saved  36.6%             ║
║  Tokens    3,112 →  1,972   saved  36.6%             ║
║  Cost    $0.007780 → $0.004930                       ║
║  Saved   $0.002850  (gpt-4o)                         ║
╚══════════════════════════════════════════════════════╝
  ✔ Significant savings — safe to proceed with compressed payload.
```

### Supported models and pricing

| Model | $/1M input tokens |
|---|---|
| gpt-4o | $2.50 |
| gpt-4.1 | $2.00 |
| gpt-4.1-mini | $0.40 |
| claude-3.7-sonnet | $3.00 |
| claude-3.5-haiku | $0.80 |
| gemini-2.0-flash | $0.10 |

---

## Use with Copilot

### Option A — Project-level (auto-activates for the workspace)

Copy the instructions file into your project:

```bash
cp /path/to/copilot-toolkit/instructions/token-shield.instructions.md \
   .github/instructions/token-shield.instructions.md
```

Copilot will automatically run the skill when it detects large inputs or trigger phrases ("token budget", "context limit", "cost optimisation").

### Option B — Global (available in all VS Code workspaces)

Symlink to the VS Code user prompts folder:

```bash
ln -s /path/to/copilot-toolkit/instructions/token-shield.instructions.md \
  ~/Library/Application\ Support/Code/User/prompts/token-shield.instructions.md
```

### Option C — On-demand in Copilot Chat

Reference the instructions file directly in any message:

```
#token-shield.instructions analyse this manifest for security issues

[paste YAML here]
```

---

## TOON example

**Before (Kubernetes Deployment, 27 tokens for this block):**

```yaml
containers:
  - name: api
    imagePullPolicy: IfNotPresent
    livenessProbe:
      initialDelaySeconds: 10
      periodSeconds: 30
    securityContext:
      runAsNonRoot: true
```

**After (21 tokens — 22% reduction):**

```yaml
ctrs:
- name: api
  imgPull: IfNP
  liveP:
    initDelay: 10
    period: 30
  secCtx:
    runAsNonRoot: true
```

The full abbreviation map is in [`scripts/abbreviations.json`](scripts/abbreviations.json) and can be extended freely.

---

## Constraints

- UUIDs, Trace IDs, and span IDs are **never removed** — the distiller preserves the first occurrence and normalises only for duplicate detection.
- `ERROR`, `CRITICAL`, `FATAL`, `ALERT` log lines are always kept verbatim.
- TOON applies only to keys/values explicitly listed in `abbreviations.json` — no ambiguous substitutions.
- YAML and JSON minification round-trips through the parser; the output is structurally identical to the input.
