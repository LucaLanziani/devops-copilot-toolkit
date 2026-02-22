"""
toon_converter.py — Convert YAML/JSON/HCL to TOON (Token-Optimized Object Notation).

TOON reduces token count by:
  1. Replacing verbose DevOps keys with short abbreviations (abbreviations.json).
  2. Dropping null / empty / default-valued fields.
  3. Inlining single-item lists when safe.
  4. Using compact separators in JSON output.

Stdout → TOON-optimised content
Stderr → conversion report

Usage:
    python toon_converter.py manifest.yaml
    python toon_converter.py --format json config.json
    cat main.tf | python toon_converter.py --format hcl
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# ──────────────────────────────────────────────
# Load abbreviation map
# ──────────────────────────────────────────────

_SCRIPT_DIR = Path(__file__).parent
_ABBR_PATH = _SCRIPT_DIR / "abbreviations.json"


def _load_abbr() -> tuple[dict[str, str], dict[str, str]]:
    if not _ABBR_PATH.exists():
        return {}, {}
    with open(_ABBR_PATH) as f:
        data = json.load(f)
    return data.get("keys", {}), data.get("values", {})


KEY_ABBR, VAL_ABBR = _load_abbr()


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

_NULL_VALUES = {None, "", "null", "~"}
_DEFAULT_SCALARS = {"false", "true"}  # kept; but empty strings / nulls removed


def _is_empty(value: Any) -> bool:
    if isinstance(value, (dict, list)):
        return len(value) == 0
    try:
        return value in _NULL_VALUES
    except TypeError:
        return False


def _abbrev_key(k: str) -> str:
    return KEY_ABBR.get(k, k)


def _abbrev_value(v: Any) -> Any:
    if isinstance(v, str):
        return VAL_ABBR.get(v, v)
    return v


def _transform(obj: Any, drop_nulls: bool = True) -> Any:
    """Recursively apply TOON transformations."""
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if drop_nulls and _is_empty(v):
                continue
            new_k = _abbrev_key(str(k))
            new_v = _transform(v, drop_nulls)
            result[new_k] = new_v
        return result
    if isinstance(obj, list):
        transformed = [_transform(item, drop_nulls) for item in obj]
        # Inline single-item lists of scalars
        if len(transformed) == 1 and not isinstance(transformed[0], (dict, list)):
            return transformed[0]
        return transformed
    return _abbrev_value(obj)


# ──────────────────────────────────────────────
# Format-specific converters
# ──────────────────────────────────────────────

def _convert_json(text: str) -> str:
    data = json.loads(text)
    toon = _transform(data)
    return json.dumps(toon, separators=(",", ":"))


def _convert_yaml(text: str) -> str:
    try:
        import yaml  # type: ignore
    except ImportError:
        raise RuntimeError(
            "PyYAML is required for YAML conversion: pip install pyyaml"
        )
    _dump_kwargs = dict(default_flow_style=False, allow_unicode=True, width=120)
    docs = list(yaml.safe_load_all(text))
    if len(docs) == 1:
        return yaml.dump(_transform(docs[0]), **_dump_kwargs).strip()
    parts = [yaml.dump(_transform(doc), **_dump_kwargs).strip() for doc in docs if doc is not None]
    return "\n---\n".join(parts)


def _strip_hcl_comments(text: str) -> str:
    """
    Best-effort comment & blank-line removal for HCL/Terraform files.
    Does NOT parse HCL; replaces # and // line comments and /* */ blocks.
    """
    # Remove /* ... */ block comments
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    # Remove # and // line comments
    text = re.sub(r"(?m)^\s*(?:#|//).*$", "", text)
    # Collapse runs of blank lines to a single blank line
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _convert_hcl(text: str) -> str:
    """Apply abbreviation substitution and comment stripping to HCL text."""
    text = _strip_hcl_comments(text)
    # Apply key abbreviations via regex word-boundary replacement
    for long, short in KEY_ABBR.items():
        # Only replace when used as a key (preceded by optional whitespace,
        # followed by optional whitespace + = or {)
        text = re.sub(
            r"(?m)^(\s*)" + re.escape(long) + r"(\s*(?:=|\{))",
            r"\g<1>" + short + r"\g<2>",
            text,
        )
    # Apply value abbreviations for quoted string values
    for long, short in VAL_ABBR.items():
        text = text.replace(f'"{long}"', f'"{short}"')
    return text


def _strip_markdown(text: str) -> str:
    """
    Reduce markdown token footprint:
      - Collapse multiple blank lines
      - Strip HTML comments
      - Remove link title attributes  [text](url "title") → [text](url)
    """
    # Remove HTML comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    # Remove link titles
    text = re.sub(r"(\[.*?\]\(.*?)\s+\"[^\"]*\"(\))", r"\1\2", text)
    # Collapse trailing whitespace on lines
    text = "\n".join(line.rstrip() for line in text.splitlines())
    # Collapse runs of blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


FORMAT_CONVERTERS = {
    "json": _convert_json,
    "yaml": _convert_yaml,
    "hcl":  _convert_hcl,
    "md":   _strip_markdown,
}

EXTENSION_MAP = {
    ".json": "json",
    ".yaml": "yaml",
    ".yml":  "yaml",
    ".tf":   "hcl",
    ".hcl":  "hcl",
    ".md":   "md",
    ".markdown": "md",
}


def detect_format(path: str | None, hint: str | None) -> str:
    if hint and hint != "auto":
        return hint
    if path:
        ext = Path(path).suffix.lower()
        if ext in EXTENSION_MAP:
            return EXTENSION_MAP[ext]
    return "yaml"  # sensible default for DevOps content


def convert(text: str, fmt: str) -> str:
    fn = FORMAT_CONVERTERS.get(fmt)
    if not fn:
        raise ValueError(f"Unknown format: {fmt}. Choose from {list(FORMAT_CONVERTERS)}")
    return fn(text)


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Convert config files to TOON (Token-Optimized Object Notation)."
    )
    parser.add_argument("file", nargs="?", help="Input file (default: stdin).")
    parser.add_argument(
        "--format", "-f",
        default="auto",
        choices=["auto", "json", "yaml", "hcl", "md"],
        help="Input format (default: auto-detect from extension).",
    )
    parser.add_argument(
        "--no-report", action="store_true",
        help="Suppress the conversion report on stderr.",
    )
    args = parser.parse_args()

    path = args.file
    if path:
        with open(path) as f:
            original = f.read()
    else:
        original = sys.stdin.read()

    fmt = detect_format(path, args.format)
    toon = convert(original, fmt)
    print(toon)

    if not args.no_report:
        before = len(original)
        after = len(toon)
        savings = (before - after) / before * 100 if before else 0
        print(
            f"\n── TOON Converter ──  format={fmt}  "
            f"chars {before:,}→{after:,}  saved {savings:.1f}%",
            file=sys.stderr,
        )


if __name__ == "__main__":
    _cli()
