"""
deduplicator.py — Remove exact duplicate lines while preserving order.

Unlike log_distiller (which normalises variable parts), this module operates
on exact string matches.  Useful for:
  - Removing repeated terraform plan resource blocks
  - Collapsing identical YAML / JSON array items
  - Cleaning copy-paste duplication in any text format

Stdout → deduplicated content
Stderr → summary

Usage:
    python deduplicator.py < input.txt
    python deduplicator.py file.txt
    python deduplicator.py --chunk-size 3 file.log   # deduplicate multi-line blocks
"""
from __future__ import annotations

import argparse
import sys
from collections import OrderedDict
from itertools import islice
from typing import Iterator


# ──────────────────────────────────────────────
# Line-level deduplication
# ──────────────────────────────────────────────

def deduplicate_lines(
    text: str,
    *,
    annotate: bool = True,
    preserve_empty: bool = True,
) -> tuple[str, dict]:
    """
    Remove duplicate lines (exact match).

    Returns (deduped_text, stats).
    stats: total_lines, unique_lines, removed_lines.
    """
    lines = text.splitlines()
    seen: OrderedDict[str, int] = OrderedDict()

    for line in lines:
        key = line if not preserve_empty or line.strip() else ""
        seen[key] = seen.get(key, 0) + 1

    output: list[str] = []
    for key, count in seen.items():
        if count > 1 and annotate:
            output.append(f"{key}  [×{count}]")
        else:
            output.append(key)

    stats = {
        "total_lines": len(lines),
        "unique_lines": len(seen),
        "removed_lines": len(lines) - len(seen),
    }
    return "\n".join(output), stats


# ──────────────────────────────────────────────
# Chunk-level deduplication (multi-line blocks)
# ──────────────────────────────────────────────

def _chunks(lines: list[str], size: int) -> Iterator[tuple[str, ...]]:
    it = iter(lines)
    while chunk := tuple(islice(it, size)):
        yield chunk


def deduplicate_chunks(
    text: str,
    chunk_size: int,
    *,
    annotate: bool = True,
) -> tuple[str, dict]:
    """
    Deduplicate non-overlapping *chunk_size*-line blocks.
    Useful for Terraform plan output where identical resource blocks repeat.
    """
    lines = text.splitlines()
    total_chunks = 0
    seen: OrderedDict[tuple[str, ...], int] = OrderedDict()

    for chunk in _chunks(lines, chunk_size):
        seen[chunk] = seen.get(chunk, 0) + 1
        total_chunks += 1

    output: list[str] = []
    for chunk, count in seen.items():
        output.extend(chunk)
        if count > 1 and annotate:
            output.append(f"  # ↑ block repeated ×{count}")

    stats = {
        "total_chunks": total_chunks,
        "unique_chunks": len(seen),
        "removed_chunks": total_chunks - len(seen),
        "chunk_size": chunk_size,
    }
    return "\n".join(output), stats


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Remove duplicate lines (or blocks) from text files."
    )
    parser.add_argument("file", nargs="?", help="Input file (default: stdin).")
    parser.add_argument(
        "--chunk-size", "-c", type=int, default=1, metavar="N",
        help="Treat N consecutive lines as one block (default: 1 = line mode).",
    )
    parser.add_argument(
        "--no-annotate", action="store_true",
        help="Do not add ×N annotations to collapsed entries.",
    )
    parser.add_argument(
        "--no-stats", action="store_true",
        help="Suppress the summary on stderr.",
    )
    args = parser.parse_args()

    if args.file:
        with open(args.file) as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    annotate = not args.no_annotate

    if args.chunk_size > 1:
        result, stats = deduplicate_chunks(text, args.chunk_size, annotate=annotate)
        kind = "chunk"
        total_key, unique_key, removed_key = "total_chunks", "unique_chunks", "removed_chunks"
    else:
        result, stats = deduplicate_lines(text, annotate=annotate)
        kind = "line"
        total_key, unique_key, removed_key = "total_lines", "unique_lines", "removed_lines"

    print(result)

    if not args.no_stats:
        removed_pct = (
            stats[removed_key] / stats[total_key] * 100 if stats[total_key] else 0
        )
        lines = [
            "",
            "── Deduplicator Report ───────────────────────────",
            f"  Mode           : {kind} (chunk-size={stats.get('chunk_size', 1)})",
            f"  Total {kind+'s':8s} : {stats[total_key]:>8,}",
            f"  Unique {kind+'s':7s} : {stats[unique_key]:>8,}",
            f"  Removed        : {stats[removed_key]:>8,}  ({removed_pct:.1f}%)",
            "─────────────────────────────────────────────────",
        ]
        print("\n".join(lines), file=sys.stderr)


if __name__ == "__main__":
    _cli()
