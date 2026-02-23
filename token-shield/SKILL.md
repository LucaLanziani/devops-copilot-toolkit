---
name: token-shield-devops
description: >
  Compresses large log streams, Terraform/CloudFormation/K8s configs, and
  Markdown docs before LLM processing to minimise token usage and cost.
version: 2.0.0
tools: ["python.execute", "fs.read"]
---

# Token Shield: Strategic Context Compression

## Activation Trigger

Activate this skill whenever the user:

1. Pastes logs (> 50 lines).
2. Asks to analyse a large Terraform, CloudFormation, or K8s manifest.
3. Shares a JSON / YAML config file.
4. Mentions "cost optimisation", "context limit", or "token budget".
5. Uploads any file > 10 KB that will be sent to an LLM.

---

## Script Inventory

| Script | Purpose | Supported Formats |
|---|---|---|
| `scripts/compress.py` | **Unified CLI** — orchestrates the full pipeline | YAML, JSON, HCL, Markdown, logs |
| `scripts/minify_config.py` | Strip comments & whitespace | YAML, JSON, HCL (.tf), Markdown |
| `scripts/toon_converter.py` | TOON key/value abbreviation | YAML, JSON, HCL |
| `scripts/log_distiller.py` | Collapse repeated log patterns | Plain text logs |
| `scripts/deduplicator.py` | Exact-line / block deduplication | Any text |
| `scripts/token_counter.py` | Token estimation & cost report | Any text |
| `scripts/abbreviations.json` | TOON abbreviation map (keys & values) | — |

---

## Compression Pipeline (applied by `compress.py`)

```
Input
  │
  ▼
[1] Minify       — strip comments, blank lines, excess whitespace
  │
  ▼
[2] TOON         — replace verbose DevOps keys with short abbreviations
  │                (namespace→ns, container→ctr, configuration→cfg …)
  ▼
[3] Distill      — (logs only) collapse repeated log lines, keep ERROR/CRITICAL verbatim
  │
  ▼
[4] Dedup        — remove exact duplicate lines as a final pass
  │
  ▼
Shield Report    — tokens before/after, cost saved, model-specific pricing
```

### Quick Usage

```bash
# Auto-detect format from extension
python scripts/compress.py manifest.yaml

# Terraform plan
python scripts/compress.py --format hcl main.tf

# Application logs via stdin
cat app.log | python scripts/compress.py --format log

# Cost report for a different model
python scripts/compress.py config.yaml --model gpt-4.1-mini

# Skip TOON step
python scripts/compress.py config.yaml --skip toon

# Token count only
python scripts/token_counter.py manifest.yaml
python scripts/token_counter.py --compare original.yaml compressed.yaml
```

---

## TOON (Token-Optimized Object Notation)

TOON reduces token count by replacing long DevOps-specific keys and values
with short forms defined in `scripts/abbreviations.json`.  The map covers
~80 common Kubernetes, Terraform, and cloud provider terms.

**Before TOON (Kubernetes manifest):**

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

**After TOON:**

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

---

## Log Distillation

`log_distiller.py` normalises variable parts of each log line (UUIDs, IPs,
numbers, timestamps) to detect structural duplicates, then collapses them:

```
2024-01-15T10:23:45Z ERROR pod/api-7f4b failed health check (attempt 1)
2024-01-15T10:23:46Z ERROR pod/api-7f4b failed health check (attempt 2)
2024-01-15T10:23:47Z ERROR pod/api-7f4b failed health check (attempt 3)
```

Becomes:

```
2024-01-15T10:23:45Z ERROR pod/api-7f4b failed health check (attempt 1)  [×3]
```

`ERROR` / `CRITICAL` / `FATAL` lines are always preserved verbatim.

---

## Shield Report Output

Every `compress.py` run prints a Shield Report to stderr:

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

---

## Supported Pricing Models

| Model | Price / 1M tokens |
|---|---|
| gpt-4o | $2.50 |
| gpt-4.1 | $2.00 |
| gpt-4.1-mini | $0.40 |
| claude-3.7-sonnet | $3.00 |
| claude-3.5-haiku | $0.80 |
| gemini-2.0-flash | $0.10 |

Pass `--model <name>` to `compress.py` or `token_counter.py` to switch.

---

## Constraints

- Never truncate unique UUIDs or Trace IDs (log distiller preserves them in
  the first occurrence; they are normalised only for duplicate detection).
- Always preserve `ERROR`, `CRITICAL`, `FATAL`, and `ALERT` log lines verbatim.
- TOON abbreviations are applied only to keys/values in `abbreviations.json`; no
  lossy or ambiguous substitutions.
- Minification round-trips through the parser for YAML and JSON — output
  structure is guaranteed to be semantically identical to the input.