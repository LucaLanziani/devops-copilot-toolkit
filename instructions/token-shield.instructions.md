---
applyTo: "**"
---

# Token Shield: Context Compression

When the user shares a large file, pastes log output (> 50 lines), or mentions
"token budget", "context limit", or "cost optimisation", apply the Token Shield
compression pipeline **before** analysing the content.

---

## How to Apply

Run the unified CLI from the `token-shield-skill/` folder:

```bash
# Config files (auto-detects YAML / JSON / HCL from extension)
python token-shield-skill/scripts/compress.py <file>

# Logs
python token-shield-skill/scripts/compress.py <file> --format log

# Via stdin
cat <file> | python token-shield-skill/scripts/compress.py --format yaml
```

Redirect stdout to capture the compressed payload and stderr for the Shield Report:

```bash
python token-shield-skill/scripts/compress.py manifest.yaml \
  > /tmp/compressed.yaml 2>/tmp/shield-report.txt

cat /tmp/shield-report.txt   # review savings
cat /tmp/compressed.yaml     # send this to the LLM
```

---

## Pipeline Steps (in order)

| Step | Script | Effect |
|---|---|---|
| Minify | `minify_config.py` | Strip comments, blank lines, excess whitespace |
| TOON | `toon_converter.py` | Abbreviate verbose DevOps keys (`namespace→ns`, `containers→ctrs` …) |
| Distill | `log_distiller.py` | Collapse repeated log patterns; keep ERROR/CRITICAL verbatim |
| Dedup | `deduplicator.py` | Remove exact duplicate lines |

Skip individual steps with `--skip <step>`, e.g. `--skip toon` to keep original key names.

---

## Shield Report

After every run, report the compression results in this format:

```
**Token Shield Report**
- Model     : gpt-4o
- Tokens    : 3,112 → 1,972  (−36.6%)
- Cost      : $0.000315 → $0.000198  (saved $0.000117)
- Pipeline  : minify → toon → dedup
```

---

## Constraints

- Never truncate UUIDs, Trace IDs, or span IDs.
- Always preserve `ERROR`, `CRITICAL`, `FATAL`, `ALERT` log lines verbatim.
- Use compressed content for analysis; present answers in terms of the **original** names (not TOON abbreviations) so the user isn't confused.
