#!/usr/bin/env python3
"""
TabPFN action-item priority scoring (TabPFN / Prior Labs partner
prototype — see CATEGORIES.md).

Idea: once the sloth has your action items, which ones actually matter?
This script turns each action item from out/digest.json into a small
tabular feature row (length, has a named owner, mentions a deadline,
mentions money/numbers, position in the file, size of its source file)
and classifies priority (low / medium / high) with TabPFN, Prior Labs'
foundation model for tabular data, few-shot style: a small hand-labelled
set of example action items (below) is the training data.

Usage:
    python3 scripts/tabpfn_priority.py
Reads  out/digest.json
Writes out/priorities.json and prints a Markdown section to stdout.

Access: TabPFN needs a Prior Labs API token — the client reads
TABPFN_TOKEN (this script also accepts TABPFN_API_TOKEN) — and the
`tabpfn-client` (API) or `tabpfn` (local) package. Without them it
prints a JSON blocker line and exits 2 — it never invents scores.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIGEST_JSON = os.path.join(ROOT, "out", "digest.json")
OUT_JSON = os.path.join(ROOT, "out", "priorities.json")

DEADLINE_WORDS = [
    "today", "tonight", "tomorrow", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday", "sunday", "eod", "eow", "asap",
    "deadline", "due", "before", "by ",
]
OWNER_RE = re.compile(r"\b([A-Z][a-z]{2,})\b")
LABELS = ["low", "medium", "high"]


def features(text: str, position_ratio: float, file_chunks: int, file_chars: int):
    words = text.split()
    return [
        float(len(text)),                       # char length
        float(len(words)),                      # word count
        1.0 if re.search(r"\b[A-Z][a-z]{2,}\b", text) else 0.0,   # named person mentioned
        1.0 if any(w in text.lower() for w in DEADLINE_WORDS) else 0.0,  # deadline language
        1.0 if re.search(r"(\$|%|\d)", text) else 0.0,            # money / numbers
        1.0 if text.rstrip().endswith(("!",)) or "urgent" in text.lower() else 0.0,  # urgency marker
        float(position_ratio),                  # how early in the file it appears
        float(file_chunks),                     # size of source file (chunks)
        float(file_chars) / 1000.0,             # size of source file (kchars)
    ]


# Hand-labelled few-shot training examples: (action item text, label).
# Labels reflect how a human would triage these in a work digest.
EXAMPLES = [
    ("Send the signed contract to the client before Friday", "high"),
    ("Pay the vendor invoice of $4,200 today", "high"),
    ("Fix the login bug blocking the beta release", "high"),
    ("Priya to confirm the venue deposit is paid by tomorrow", "high"),
    ("Submit the tax filing before the deadline on Monday", "high"),
    ("Call the customer about the outage and send a status update tonight", "high"),
    ("Approve the budget so procurement can order the servers this week", "high"),
    ("Renew the SSL certificate before it expires on Thursday", "high"),
    ("Email the updated attendee list to all speakers", "medium"),
    ("Schedule the design review for next week", "medium"),
    ("Draft the migration guide for legacy customers", "medium"),
    ("Book flights for the conference in November", "medium"),
    ("Prepare the demo environment for the client workshop", "medium"),
    ("Review the pull request from Karim when you get a chance", "medium"),
    ("Update the onboarding document with the new steps", "medium"),
    ("Check whether the analytics dashboard numbers look right", "medium"),
    ("Order more office coffee sometime", "low"),
    ("Tidy up the shared drive folders eventually", "low"),
    ("Think about a new name for the internal newsletter", "low"),
    ("Look at colour options for the swag stickers", "low"),
    ("Water the plants in the meeting room", "low"),
    ("Add the team lunch photos to the album", "low"),
    ("Consider reorganising the bookshelf in the lounge", "low"),
    ("Browse ideas for the holiday party playlist", "low"),
]


def load_classifier():
    """Return a fitted-ready TabPFN classifier or raise with a reason."""
    token = os.environ.get("TABPFN_TOKEN") or os.environ.get("TABPFN_API_TOKEN")
    try:
        import tabpfn_client

        if token:
            tabpfn_client.set_access_token(token)
        return tabpfn_client.TabPFNClassifier(), "tabpfn-client (Prior Labs API)"
    except ImportError:
        pass
    try:
        from tabpfn import TabPFNClassifier

        return TabPFNClassifier(), "tabpfn (local model)"
    except ImportError:
        raise RuntimeError(
            "neither `tabpfn-client` nor `tabpfn` is installed "
            "(pip install tabpfn-client) and/or TABPFN_API_TOKEN is missing"
        )


def main() -> int:
    if not os.path.exists(DIGEST_JSON):
        print(json.dumps({"status": "blocked", "reason": "out/digest.json not found; run a digest first"}))
        return 2

    with open(DIGEST_JSON) as fh:
        files = json.load(fh)

    items = []  # (file_name, action_text, feature_row)
    for f in files:
        actions = f.get("actions") or []
        chunks = f.get("chunks") or []
        file_chars = sum(len(c.get("text", "")) for c in chunks)
        for i, action in enumerate(actions):
            ratio = (i + 1) / max(len(actions), 1)
            items.append((f["name"], action, features(action, ratio, len(chunks), file_chars)))

    if not items:
        print(json.dumps({"status": "empty", "reason": "no action items in the digest"}))
        return 0

    try:
        clf, backend = load_classifier()
    except RuntimeError as err:
        print(json.dumps({"status": "blocked", "reason": str(err)}))
        return 2

    x_train = [features(text, 0.5, 3, 3000) for text, _ in EXAMPLES]
    y_train = [LABELS.index(label) for _, label in EXAMPLES]
    try:
        clf.fit(x_train, y_train)
        preds = clf.predict([row for _, _, row in items])
        try:
            probas = clf.predict_proba([row for _, _, row in items])
        except Exception:
            probas = [None] * len(items)
    except Exception as err:  # auth missing, quota, network — report, don't crash
        print(json.dumps({"status": "blocked", "reason": f"{backend}: {err}"}))
        return 2

    results = []
    for (fname, action, _), pred, proba in zip(items, preds, probas):
        results.append({
            "file": fname,
            "action": action,
            "priority": LABELS[int(pred)],
            "confidence": round(float(max(proba)), 3) if proba is not None else None,
            "backend": backend,
        })

    with open(OUT_JSON, "w") as fh:
        json.dump(results, fh, indent=2)

    order = {"high": 0, "medium": 1, "low": 2}
    lines = ["## 🎯 Action item priorities (TabPFN)", ""]
    for r in sorted(results, key=lambda r: order[r["priority"]]):
        conf = f" ({r['confidence']:.0%})" if r["confidence"] is not None else ""
        lines.append(f"- **{r['priority'].upper()}**{conf} — {r['action']} _({r['file']})_")
    lines.append("")
    lines.append(f"_Scored by TabPFN via {backend}: few-shot tabular classification over per-item features._")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
