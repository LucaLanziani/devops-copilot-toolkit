"""
minify_config.py — Strip comments and whitespace from YAML, JSON, HCL, and Markdown.

For YAML/JSON the file is round-tripped through the parser so comments are
removed structurally and output uses compact separators.
For HCL/Markdown a regex-based approach is used (no dependency on hcl2).

Stdout → minified content
Stderr → char reduction report

Usage:
    python minify_config.py manifest.yaml
    python minify_config.py --format json config.json
    cat main.tf | python minify_config.py --format hcl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


# ──────────────────────────────────────────────
# Format-specific minifiers
# ──────────────────────────────────────────────

def minify_yaml(text: str) -> str:
    """Round-trip through PyYAML to strip comments; dump compact. Supports multi-document files."""
    try:
        import yaml  # type: ignore
    except ImportError:
        raise RuntimeError("PyYAML required: pip install pyyaml")

    _dump_kwargs = dict(default_flow_style=False, allow_unicode=True, width=120)
    docs = list(yaml.safe_load_all(text))
    if len(docs) == 1:
        return yaml.dump(docs[0], **_dump_kwargs).strip()
    parts = [yaml.dump(doc, **_dump_kwargs).strip() for doc in docs if doc is not None]
    return "\n---\n".join(parts)


def minify_json(text: str) -> str:
    """Parse and re-dump JSON with compact separators (no whitespace)."""
    data = json.loads(text)
    return json.dumps(data, separators=(",", ":"))


def minify_hcl(text: str) -> str:
    """
    Best-effort HCL/Terraform minifier (regex-based, no hcl2 dependency).
    Removes:
      - # and // line comments
      - /* */ block comments
      - blank lines
      - trailing whitespace
    """
    # Remove block comments
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    # Remove line comments (# and //)
    text = re.sub(r"(?m)\s*(?:#|//).*$", "", text)
    # Strip trailing whitespace
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Remove blank lines
    lines = [ln for ln in lines if ln.strip()]
    return "\n".join(lines)


def minify_markdown(text: str) -> str:
    """
    Reduce markdown size:
      - Remove HTML comments
      - Strip link titles
      - Collapse multiple blank lines to one
      - Remove trailing whitespace
    """
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"(\[.*?\]\(.*?)\s+\"[^\"]*\"(\))", r"\1\2", text)
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Collapse consecutive blank lines
    result: list[str] = []
    prev_blank = False
    for ln in lines:
        is_blank = not ln.strip()
        if is_blank and prev_blank:
            continue
        result.append(ln)
        prev_blank = is_blank
    return "\n".join(result).strip()


# ──────────────────────────────────────────────
# Format detection
# ──────────────────────────────────────────────

EXTENSION_MAP = {
    ".yaml": "yaml", ".yml": "yaml",
    ".json": "json",
    ".tf":   "hcl",  ".hcl": "hcl",
    ".md":   "md",   ".markdown": "md",
}

MINIFIERS = {
    "yaml": minify_yaml,
    "json": minify_json,
    "hcl":  minify_hcl,
    "md":   minify_markdown,
}


def detect_format(path: str | None, hint: str | None) -> str:
    if hint and hint != "auto":
        return hint
    if path:
        ext = Path(path).suffix.lower()
        if ext in EXTENSION_MAP:
            return EXTENSION_MAP[ext]
    return "yaml"


def shrink_devops_file(file_content: str, fmt: str = "yaml") -> str:
    """Public API: minify *file_content* using the given format."""
    fn = MINIFIERS.get(fmt)
    if not fn:
        raise ValueError(f"Unknown format '{fmt}'. Choose from: {list(MINIFIERS)}")
    return fn(file_content)


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Minify YAML, JSON, HCL (Terraform), and Markdown files."
    )
    parser.add_argument("file", nargs="?", help="Input file (default: stdin).")
    parser.add_argument(
        "--format", "-f",
        default="auto",
        choices=["auto", "yaml", "json", "hcl", "md"],
        help="Input format (default: auto-detect from extension).",
    )
    parser.add_argument(
        "--no-report", action="store_true",
        help="Suppress the reduction report on stderr.",
    )
    args = parser.parse_args()

    path = args.file
    if path:
        with open(path) as f:
            original = f.read()
    else:
        original = sys.stdin.read()

    fmt = detect_format(path, args.format)
    minified = shrink_devops_file(original, fmt)
    print(minified)

    if not args.no_report:
        before = len(original)
        after = len(minified)
        savings = (before - after) / before * 100 if before else 0
        print(
            f"\n── Minifier  format={fmt}  "
            f"chars {before:,}→{after:,}  saved {savings:.1f}%",
            file=sys.stderr,
        )


if __name__ == "__main__":
    _cli()
