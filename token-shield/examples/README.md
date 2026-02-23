# Examples

Real-world input files demonstrating Token Shield compression across the four supported content types. Run them all at once or individually against the scripts in `../scripts/`.

---

## Structure

```
examples/
├── kubernetes/
│   └── deployment.yaml        # Verbose K8s Deployment + Service + HPA (~220 lines)
├── terraform/
│   └── main.tf                # ECS Fargate service + ALB + target group (~200 lines)
├── logs/
│   └── app.log                # payment-api log stream with circuit-breaker incident
├── json/
│   └── service-config.json    # Runtime config with comments and nested defaults
├── javascript/
│   ├── payment-stack.ts       # AWS CDK TypeScript stack with heavy JSDoc (~350 lines)
│   └── payment-api.js         # Node.js Express API with circuit breaker & JSDoc (~330 lines)
├── run_examples.sh            # Run all examples and write output to examples/output/
└── README.md                  # This file
```

---

## Run all examples

```bash
cd token-shield-skill
bash examples/run_examples.sh
```

Compressed files are written to `examples/output/`. Each run prints the Shield Report inline.

---

## Structure

```
examples/
├── kubernetes/
│   └── deployment.yaml        # Verbose K8s Deployment + Service + HPA (~220 lines)
├── terraform/
│   └── main.tf                # ECS Fargate service + ALB + target group (~200 lines)
├── logs/
│   └── app.log                # payment-api log stream with circuit-breaker incident
├── json/
│   └── service-config.json    # Runtime config with comments and nested defaults
├── markdown/
│   └── adr-0042-circuit-breaker.md  # Architecture Decision Record with HTML comments
├── javascript/
│   ├── payment-stack.ts       # AWS CDK TypeScript stack with heavy JSDoc comments (~350 lines)
│   └── payment-api.js         # Node.js Express API with circuit breaker & JSDoc (~330 lines)
├── run_examples.sh            # Run all examples and write output to examples/output/
└── README.md                  # This file
```

---

## Run individually

### Kubernetes manifest

```bash
python scripts/compress.py examples/kubernetes/deployment.yaml
```

What happens:
- Comments stripped, blank lines removed
- `namespace → ns`, `containers → ctrs`, `imagePullPolicy → imgPull`, `livenessProbe → liveP`, `securityContext → secCtx`, `volumeMounts → volMnts`, `affinity → aff` …
- Repeated label blocks deduplicated

Expected savings: **~46% tokens** (1,636 → 884)

---

### Terraform file

```bash
python scripts/compress.py examples/terraform/main.tf
```

What happens:
- All `#` and `//` line comments removed
- Block comments `/* … */` removed
- Blank lines collapsed
- Terraform key abbreviations applied (`depends_on → deps_on`, `lifecycle → lc`, `connection → conn` …)
- Repeated `tags` blocks deduplicated

Expected savings: **~41% tokens** (1,575 → 923)

---

### Application logs

```bash
python scripts/compress.py examples/logs/app.log --format log
```

What happens:
- Variable parts (UUIDs, timestamps, numbers) normalised for pattern matching
- Repeated health-check lines collapsed: `GET /healthz … [×6]`
- Repeated `Metrics flushed` lines collapsed: `[×4]`
- `CRITICAL` and `ERROR` lines kept verbatim — the circuit-breaker incident is fully preserved

Expected savings: **~34% tokens** (1,409 → 932) — larger production logs with more repetition compress further

---

### JSON config

```bash
python scripts/compress.py examples/json/service-config.json
```

What happens:
- `_comment`, `_last_updated`, `_owner` fields (null-equivalent comments) removed
- JSON re-serialised with compact separators (no spaces after `:` or `,`)
- Nested `circuit_breaker` blocks deduplicated

Expected savings: **~36% tokens** (828 → 527)

---

---

### Markdown ADR

```bash
python scripts/compress.py examples/markdown/adr-0042-circuit-breaker.md
```

What happens:
- HTML comments (`<!-- … -->`) removed (includes section headers, inline notes, and the ToC comment)
- Link title attributes stripped: `[text](url "title")` → `[text](url)`
- Consecutive blank lines collapsed to one
- Trailing whitespace removed from every line

Expected savings: **~14% tokens** (1,725 → 1,479) — prose compresses less than structured data, but HTML comments can be substantial in long docs

---

### TypeScript / JavaScript file

```bash
python scripts/compress.py examples/javascript/payment-stack.ts
```

What happens:
- Block comments (`/* … */` and `/** @fileoverview … */` JSDoc blocks) stripped entirely
- Inline `//` comments removed — URL literals (`https://…`) are preserved unharmed
- Consecutive blank lines collapsed to a single blank line
- Duplicate import patterns and repeated tag-object blocks deduplicated

> **Note:** TOON abbreviation is intentionally skipped for JS/TS — renaming
> identifiers with regex is unsafe and would break the code. Savings come from
> comment removal alone, which is still substantial in well-documented CDK stacks.

Expected savings: **~43% tokens** (6,274 → 3,604)

---

### Node.js file

```bash
python scripts/compress.py examples/javascript/payment-api.js
```

What happens:
- `/** … */` JSDoc blocks (route docs, helper docs, config comments) stripped entirely
- `// …` inline comments removed — `https://` URLs inside string literals are unaffected
- Consecutive blank lines collapsed to a single blank line
- Duplicate error-handling patterns and repeated `req.log` / `metrics` call blocks deduplicated

Expected savings: **~46% tokens** (4,423 → 2,392)

---

## Skip a step

```bash
# Keep original key names (no TOON abbreviation)
python scripts/compress.py examples/kubernetes/deployment.yaml --skip toon

# Minify + TOON only, no deduplication
python scripts/compress.py examples/kubernetes/deployment.yaml --skip dedup
```

---

## Change the pricing model

```bash
python scripts/compress.py examples/kubernetes/deployment.yaml --model claude-3.7-sonnet
python scripts/compress.py examples/kubernetes/deployment.yaml --model gpt-4.1-mini
```

---

## Token count only (no compression)

```bash
# Count tokens in the raw input
python scripts/token_counter.py examples/kubernetes/deployment.yaml

# Compare raw vs compressed
python scripts/token_counter.py --compare \
  examples/kubernetes/deployment.yaml \
  examples/output/deployment.compressed.yaml
```
