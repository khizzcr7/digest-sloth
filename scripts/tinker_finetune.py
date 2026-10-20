#!/usr/bin/env python3
"""
Tinker fine-tune prototype (Tinker / Thinking Machines partner
assessment — see CATEGORIES.md for the full feasibility write-up).

What this script DOES, for real, today:
  Builds a supervised fine-tuning dataset from Digest Sloth's own
  checkpoint state (.state/progress.json): every chunk the local model
  has summarised becomes one SFT example using the exact prompts from
  src/model.ts — {system, user} -> {assistant: summary}. The dataset is
  written to data/sft-dataset.jsonl and basic stats are printed. This is
  the genuine input a Tinker LoRA fine-tune of an open-weight model
  (e.g. Qwen3-8B) would consume.

What it does NOT do without access:
  Submit the training run. That needs a Tinker API key
  (TINKER_API_KEY, issued by Thinking Machines — access was
  application/waitlist-gated) and the `tinker` Python SDK. With both
  present it prints the exact run configuration it would submit.

Honest architectural note: Tinker fine-tunes *hosted* models and serves
them through its sampling API. A fine-tuned checkpoint is not an ONNX
file you can drop into the local Transformers.js pipeline, so the
before/after comparison for this project would be: local
Qwen2.5-0.5B summaries vs the Tinker-hosted fine-tuned model's
summaries on held-out chunks, both scored for faithfulness/length.
The local-first design stays the default either way.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, ".state", "progress.json")
OUT = os.path.join(ROOT, "data", "sft-dataset.jsonl")

SYSTEM = (
    "You are the engine inside Digest Sloth, a tool that digests documents. "
    "You answer concisely and faithfully. You never invent facts that are not in the text. "
    "You write plain, clear English and output exactly what is asked, with no preamble."
)
USER_TEMPLATE = (
    "Summarize the following text in one or two sentences. "
    "Output only the summary, as plain prose.\n\n{text}"
)


def build_dataset() -> int:
    if not os.path.exists(STATE):
        print("No .state/progress.json yet — run `npm run demo` first.")
        return 0
    with open(STATE) as fh:
        state = json.load(fh)
    rows = []
    for f in state.get("files", {}).values():
        for chunk in f.get("chunks", []):
            if chunk.get("summary"):
                rows.append({
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": USER_TEMPLATE.format(text=chunk["text"])},
                        {"role": "assistant", "content": chunk["summary"]},
                    ]
                })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
    return len(rows)


def main() -> int:
    n = build_dataset()
    print(f"SFT dataset: {n} examples -> data/sft-dataset.jsonl")
    if n == 0:
        return 0

    key = os.environ.get("TINKER_API_KEY")
    try:
        import tinker  # noqa: F401
        sdk = True
    except ImportError:
        sdk = False

    if not key or not sdk:
        missing = []
        if not key:
            missing.append("TINKER_API_KEY not set (Tinker access is application-gated by Thinking Machines)")
        if not sdk:
            missing.append("`tinker` Python SDK not installed (pip install tinker)")
        print(json.dumps({"status": "blocked", "reason": "; ".join(missing)}))
        return 2

    print(
        "Would submit: LoRA fine-tune, base model Qwen/Qwen3-8B, "
        f"dataset data/sft-dataset.jsonl ({n} examples), then a before/after "
        "summary comparison on held-out chunks via the Tinker sampling API. "
        "Training submission is intentionally left to a human run because it "
        "spends real API credits."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
