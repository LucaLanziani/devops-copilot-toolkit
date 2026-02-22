"""
token_counter.py — Token estimation and cost reporting.

Tries to use tiktoken (cl100k_base) when available; falls back to
a fast character-based heuristic (1 token ≈ 4 chars).

Usage:
    python token_counter.py < file.txt
    python token_counter.py --compare original.txt compressed.txt
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

# ──────────────────────────────────────────────
# Token estimation
# ──────────────────────────────────────────────

_ENCODER = None


def _get_encoder():
    global _ENCODER
    if _ENCODER is None:
        try:
            import tiktoken  # type: ignore

            _ENCODER = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            _ENCODER = False  # sentinel: tiktoken unavailable
    return _ENCODER


def count_tokens(text: str) -> int:
    """Return an estimated token count for *text*."""
    enc = _get_encoder()
    if enc:
        return len(enc.encode(text))
    # Fallback heuristic: 1 token ≈ 4 characters (GPT-4 average)
    return max(1, len(text) // 4)


# ──────────────────────────────────────────────
# Cost table  (price per 1 M input tokens, USD)
# ──────────────────────────────────────────────

MODELS: dict[str, float] = {
    "gpt-4o":           2.50,
    "gpt-4.1":          2.00,
    "gpt-4.1-mini":     0.40,
    "claude-3.7-sonnet":3.00,
    "claude-3.5-haiku": 0.80,
    "gemini-2.0-flash": 0.10,
}

DEFAULT_MODEL = "gpt-4o"


def estimate_cost(tokens: int, model: str = DEFAULT_MODEL) -> float:
    """Return estimated USD cost for *tokens* input tokens."""
    rate = MODELS.get(model, MODELS[DEFAULT_MODEL])
    return tokens * rate / 1_000_000


# ──────────────────────────────────────────────
# Report helpers
# ──────────────────────────────────────────────

@dataclass
class TokenReport:
    original_tokens: int
    compressed_tokens: int
    model: str

    @property
    def saved_tokens(self) -> int:
        return self.original_tokens - self.compressed_tokens

    @property
    def savings_pct(self) -> float:
        if self.original_tokens == 0:
            return 0.0
        return self.saved_tokens / self.original_tokens * 100

    @property
    def original_cost(self) -> float:
        return estimate_cost(self.original_tokens, self.model)

    @property
    def compressed_cost(self) -> float:
        return estimate_cost(self.compressed_tokens, self.model)

    @property
    def cost_saved(self) -> float:
        return self.original_cost - self.compressed_cost

    def summary_lines(self) -> list[str]:
        enc_note = "(tiktoken cl100k_base)" if _get_encoder() else "(heuristic: 1 token ≈ 4 chars)"
        return [
            f"Token Counter  {enc_note}",
            f"  Model          : {self.model}  (${MODELS.get(self.model, MODELS[DEFAULT_MODEL]):.2f}/1M tokens)",
            f"  Before         : {self.original_tokens:>10,} tokens   ${self.original_cost:.6f}",
            f"  After          : {self.compressed_tokens:>10,} tokens   ${self.compressed_cost:.6f}",
            f"  Saved          : {self.saved_tokens:>10,} tokens   ${self.cost_saved:.6f}",
            f"  Reduction      : {self.savings_pct:>9.1f}%",
        ]

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "original_tokens": self.original_tokens,
            "compressed_tokens": self.compressed_tokens,
            "saved_tokens": self.saved_tokens,
            "savings_pct": round(self.savings_pct, 2),
            "original_cost_usd": round(self.original_cost, 8),
            "compressed_cost_usd": round(self.compressed_cost, 8),
            "cost_saved_usd": round(self.cost_saved, 8),
        }


def build_report(original: str, compressed: str, model: str = DEFAULT_MODEL) -> TokenReport:
    return TokenReport(
        original_tokens=count_tokens(original),
        compressed_tokens=count_tokens(compressed),
        model=model,
    )


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────

def _cli() -> None:
    parser = argparse.ArgumentParser(
        description="Estimate token counts and cost for text files."
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="One file → count only. Two files → original + compressed comparison.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        choices=list(MODELS),
        help="Pricing model to use for cost estimates.",
    )
    parser.add_argument(
        "--json", action="store_true", help="Output report as JSON."
    )
    args = parser.parse_args()

    if len(args.files) == 0:
        text = sys.stdin.read()
        tokens = count_tokens(text)
        if args.json:
            import json
            print(json.dumps({"tokens": tokens, "cost_usd": round(estimate_cost(tokens, args.model), 8)}))
        else:
            enc = "(tiktoken)" if _get_encoder() else "(heuristic)"
            print(f"{tokens:,} tokens  {enc}  ${estimate_cost(tokens, args.model):.6f}")
    elif len(args.files) == 1:
        with open(args.files[0]) as f:
            text = f.read()
        tokens = count_tokens(text)
        if args.json:
            import json
            print(json.dumps({"tokens": tokens, "cost_usd": round(estimate_cost(tokens, args.model), 8)}))
        else:
            enc = "(tiktoken)" if _get_encoder() else "(heuristic)"
            print(f"{tokens:,} tokens  {enc}  ${estimate_cost(tokens, args.model):.6f}")
    else:
        with open(args.files[0]) as f:
            original = f.read()
        with open(args.files[1]) as f:
            compressed = f.read()
        report = build_report(original, compressed, args.model)
        if args.json:
            import json
            print(json.dumps(report.to_dict(), indent=2))
        else:
            print("\n".join(report.summary_lines()))


if __name__ == "__main__":
    _cli()
