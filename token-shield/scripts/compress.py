"""
compress.py — Token Shield: Unified Compression CLI

Orchestrates the full compression pipeline:
  1. Minify  — strip comments & whitespace (minify_config.py)
  2. TOON    — abbreviate verbose DevOps keys (toon_converter.py)
  3. Dedup   — collapse repeated lines/blocks (deduplicator.py)
  4. Distill — (logs only) extract unique patterns (log_distiller.py)
  5. Report  — token count, cost estimate, Shield summary

Auto-detects input format from file extension or --format flag.

Usage:
    python compress.py manifest.yaml
    python compress.py main.tf
    python compress.py app.log --format log
    python compress.py --format json < config.json
    python compress.py manifest.yaml --model gpt-4.1-mini --report
    python compress.py manifest.yaml --skip toon dedup
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ── Local module imports (same scripts/ directory) ────────────────────────────
_HERE = Path(__file__).parent
sys.path.insert(0, str(_HERE))

from minify_config import detect_format as _detect_fmt, shrink_devops_file
from toon_converter import convert as toon_convert, detect_format as _toon_detect
from deduplicator import deduplicate_lines
from log_distiller import distill as log_distill
from token_counter import build_report, MODELS, DEFAULT_MODEL

# ──────────────────────────────────────────────
# Pipeline
# ──────────────────────────────────────────────

STEPS = ("minify", "toon", "dedup", "distill")

LOG_EXTENSIONS = {".log", ".out", ".txt", ".stderr", ".stdout"}
LOG_FORMATS = {"log", "logs"}


def _is_log(path: str | None, fmt: str) -> bool:
    if fmt in LOG_FORMATS:
        return True
    if path and Path(path).suffix.lower() in LOG_EXTENSIONS:
        return True
    return False


def compress(
    text: str,
    *,
    path: str | None = None,
    fmt: str = "auto",
    skip: set[str] | None = None,
) -> tuple[str, dict]:
    """
    Run the compression pipeline on *text*.

    Returns (compressed_text, pipeline_stats).
    pipeline_stats keys: format, steps_applied, per_step_chars.
    """
    skip = skip or set()
    stats: dict = {"format": fmt, "steps_applied": [], "per_step_chars": {}}

    is_log = _is_log(path, fmt)

    # Resolve format for config-aware steps
    config_fmt = _detect_fmt(path, None if fmt in ("auto", "log", "logs") else fmt)

    # Show the resolved format in the Shield Report (not the raw "auto" token)
    if fmt == "auto":
        stats["format"] = "log" if is_log else config_fmt
    elif fmt in ("log", "logs"):
        stats["format"] = "log"
    else:
        stats["format"] = fmt

    result = text
    stats["per_step_chars"]["input"] = len(result)

    # Step 1: Minify (skip for logs or markdown — distil/dedup handles those)
    if "minify" not in skip and not is_log:
        try:
            result = shrink_devops_file(result, config_fmt)
            stats["steps_applied"].append("minify")
        except Exception as e:
            print(f"  [minify skipped: {e}]", file=sys.stderr)
    stats["per_step_chars"]["after_minify"] = len(result)

    # Step 2: TOON conversion (config files only)
    if "toon" not in skip and not is_log and config_fmt in ("yaml", "json", "hcl"):
        try:
            result = toon_convert(result, config_fmt)
            stats["steps_applied"].append("toon")
        except Exception as e:
            print(f"  [toon skipped: {e}]", file=sys.stderr)
    stats["per_step_chars"]["after_toon"] = len(result)

    # Step 3: Distill (logs only)
    if "distill" not in skip and is_log:
        result, distill_stats = log_distill(result)
        stats["steps_applied"].append("distill")
        stats["distill"] = distill_stats
    stats["per_step_chars"]["after_distill"] = len(result)

    # Step 4: Dedup — always as a final pass.
    # For Markdown, disable annotations (no [×N] noise in prose) and preserve
    # blank lines normally — consecutive blanks are already collapsed by minify.
    if "dedup" not in skip:
        md_mode = config_fmt == "md"
        result, dedup_stats = deduplicate_lines(result, annotate=not md_mode)
        stats["steps_applied"].append("dedup")
        stats["dedup"] = dedup_stats
    stats["per_step_chars"]["after_dedup"] = len(result)

    return result, stats


# ──────────────────────────────────────────────
# Shield Report
# ──────────────────────────────────────────────

def _shield_report(
    original: str,
    compressed: str,
    *,
    model: str,
    pipeline_stats: dict,
) -> list[str]:
    report = build_report(original, compressed, model)
    char_before = len(original)
    char_after = len(compressed)
    char_pct = (char_before - char_after) / char_before * 100 if char_before else 0

    lines = [
        "",
        "╔══════════════════════════════════════════════════════╗",
        "║              TOKEN SHIELD  ·  Shield Report          ║",
        "╠══════════════════════════════════════════════════════╣",
        f"║  Format       : {pipeline_stats['format']:<37}║",
        f"║  Pipeline     : {' → '.join(pipeline_stats['steps_applied']) or 'none':<37}║",
        "╠══════════════════════════════════════════════════════╣",
        f"║  Chars   {char_before:>8,} → {char_after:>8,}   saved {char_pct:>5.1f}%        ║",
        f"║  Tokens  {report.original_tokens:>8,} → {report.compressed_tokens:>8,}   saved {report.savings_pct:>5.1f}%        ║",
        f"║  Cost    ${report.original_cost:.6f} → ${report.compressed_cost:.6f}             ║",
        f"║  Saved   ${report.cost_saved:.6f}  ({model})                ║",
        "╚══════════════════════════════════════════════════════╝",
    ]

    # Contextual advice
    if report.savings_pct >= 40:
        lines.append("  ✔ Significant savings — safe to proceed with compressed payload.")
    elif report.savings_pct >= 15:
        lines.append("  ✔ Moderate savings applied.")
    else:
        lines.append("  ℹ Minimal savings — input may already be compact.")

    return lines


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Token Shield: compress configs or logs before sending to an LLM.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  python compress.py manifest.yaml
  python compress.py main.tf --model gpt-4.1-mini
  python compress.py app.log --format log
  cat big.json | python compress.py --format json
  python compress.py config.yaml --skip toon
        """,
    )
    parser.add_argument("file", nargs="?", help="Input file (default: stdin).")
    parser.add_argument(
        "--format", "-f",
        default="auto",
        choices=["auto", "yaml", "json", "hcl", "md", "js", "log"],
        help="Input format (default: auto-detect).",
    )
    parser.add_argument(
        "--skip", nargs="+", choices=list(STEPS), default=[],
        metavar="STEP",
        help=f"Skip pipeline steps. Choices: {', '.join(STEPS)}.",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL, choices=list(MODELS),
        help=f"Model for cost estimates (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--report-only", action="store_true",
        help="Print Shield Report to stdout instead of stderr; suppress compressed output.",
    )
    parser.add_argument(
        "--no-report", action="store_true",
        help="Suppress the Shield Report entirely.",
    )
    args = parser.parse_args()

    path = args.file
    if path:
        with open(path) as f:
            original = f.read()
    else:
        original = sys.stdin.read()

    compressed, pipeline_stats = compress(
        original,
        path=path,
        fmt=args.format,
        skip=set(args.skip),
    )

    if not args.report_only:
        print(compressed)

    if not args.no_report:
        report_lines = _shield_report(
            original, compressed, model=args.model, pipeline_stats=pipeline_stats
        )
        dest = sys.stdout if args.report_only else sys.stderr
        print("\n".join(report_lines), file=dest)


if __name__ == "__main__":
    _cli()
