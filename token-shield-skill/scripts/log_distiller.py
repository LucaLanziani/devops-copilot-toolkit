"""
log_distiller.py — Extract signal from noisy log streams.

Normalises variable parts of log lines (UUIDs, IPs, numbers, timestamps)
to detect duplicate patterns, then collapses repeated entries into a single
line with an occurrence count.  ERROR / CRITICAL lines are always preserved
verbatim (never collapsed).

Stdout  → distilled log content
Stderr  → summary statistics

Usage:
    python log_distiller.py < app.log
    python log_distiller.py app.log [app2.log ...]
    python log_distiller.py --stats-only < app.log
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import Counter, OrderedDict
from typing import NamedTuple

# ──────────────────────────────────────────────
# Normalisation patterns
# ──────────────────────────────────────────────

_NORMALIZERS = [
    # ISO-8601 timestamps (must come before generic number)
    (re.compile(
        r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b"
    ), "<TS>"),
    # Epoch ms timestamps (13-digit numbers)
    (re.compile(r"\b\d{13}\b"), "<EPOCH_MS>"),
    # UUID / GUID
    (re.compile(
        r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
        re.I,
    ), "<UUID>"),
    # IPv4
    (re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"), "<IPv4>"),
    # IPv6 (simplified)
    (re.compile(r"\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b", re.I), "<IPv6>"),
    # Hex values (e.g. memory addresses like 0x7f4a2b)
    (re.compile(r"\b0x[0-9a-f]+\b", re.I), "<HEX>"),
    # Generic numbers (keep last to avoid clobbering earlier patterns)
    (re.compile(r"\b\d+\b"), "<N>"),
]

# ──────────────────────────────────────────────
# Log level detection
# ──────────────────────────────────────────────

_LEVELS_RE = re.compile(
    r"\b(EMERGENCY|ALERT|CRITICAL|FATAL|ERROR|WARN(?:ING)?|NOTICE|INFO|DEBUG|TRACE)\b",
    re.I,
)
_HIGH_PRIORITY = {"EMERGENCY", "ALERT", "CRITICAL", "FATAL", "ERROR"}


def _detect_level(line: str) -> str:
    m = _LEVELS_RE.search(line)
    if not m:
        return "INFO"
    lvl = m.group(1).upper()
    return "WARNING" if lvl == "WARN" else lvl


# ──────────────────────────────────────────────
# Core distillation
# ──────────────────────────────────────────────

class _Entry(NamedTuple):
    first_line: str
    level: str
    count: int


def _normalize(line: str) -> str:
    result = line
    for pattern, replacement in _NORMALIZERS:
        result = pattern.sub(replacement, result)
    return result.strip()


def distill(text: str) -> tuple[str, dict]:
    """
    Returns (distilled_text, stats_dict).
    stats_dict keys: total_lines, unique_patterns, removed_lines,
                     high_priority_count, levels_seen.
    """
    lines = text.splitlines()
    total = len(lines)

    # OrderedDict preserves first-seen order
    patterns: OrderedDict[str, _Entry] = OrderedDict()
    level_counter: Counter[str] = Counter()

    for raw in lines:
        raw = raw.rstrip()
        if not raw:
            continue
        level = _detect_level(raw)
        level_counter[level] += 1
        norm = _normalize(raw)

        if norm in patterns:
            entry = patterns[norm]
            patterns[norm] = _Entry(entry.first_line, entry.level, entry.count + 1)
        else:
            patterns[norm] = _Entry(raw, level, 1)

    output_lines: list[str] = []
    for norm, entry in patterns.items():
        if entry.count > 1:
            output_lines.append(f"{entry.first_line}  [×{entry.count}]")
        else:
            output_lines.append(entry.first_line)

    distilled = "\n".join(output_lines)
    high_priority = sum(
        entry.count for entry in patterns.values()
        if entry.level in _HIGH_PRIORITY
    )

    stats = {
        "total_lines": total,
        "unique_patterns": len(patterns),
        "removed_lines": total - len(patterns),
        "high_priority_count": high_priority,
        "levels_seen": dict(level_counter.most_common()),
    }
    return distilled, stats


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Distil log files by collapsing repeated patterns."
    )
    parser.add_argument("files", nargs="*", help="Log files (default: stdin).")
    parser.add_argument(
        "--stats-only", action="store_true",
        help="Print only the statistics summary, not the distilled log.",
    )
    parser.add_argument(
        "--no-stats", action="store_true",
        help="Suppress the statistics block on stderr.",
    )
    args = parser.parse_args()

    if args.files:
        parts = []
        for path in args.files:
            with open(path) as f:
                parts.append(f.read())
        raw = "\n".join(parts)
    else:
        raw = sys.stdin.read()

    distilled, stats = distill(raw)

    if not args.stats_only:
        print(distilled)

    if not args.no_stats:
        removed_pct = (
            stats["removed_lines"] / stats["total_lines"] * 100
            if stats["total_lines"]
            else 0
        )
        lines = [
            "",
            "── Log Distiller Report ─────────────────────────",
            f"  Total lines      : {stats['total_lines']:>8,}",
            f"  Unique patterns  : {stats['unique_patterns']:>8,}",
            f"  Lines collapsed  : {stats['removed_lines']:>8,}  ({removed_pct:.1f}%)",
            f"  High-priority    : {stats['high_priority_count']:>8,}  (ERROR/CRITICAL/FATAL)",
            "  Levels seen      : "
            + "  ".join(f"{k}={v}" for k, v in stats["levels_seen"].items()),
            "─────────────────────────────────────────────────",
        ]
        print("\n".join(lines), file=sys.stderr)


if __name__ == "__main__":
    _cli()
