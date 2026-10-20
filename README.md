# 🦥 Digest Sloth

**Drop files in. Wake up to a digest.**

Digest Sloth is a tiny overnight digest agent for people who keep meaning to
read things. Drop text files into a folder — team chat exports, meeting
notes, long documents — and it works through them *slowly*: one small chunk
at a time, powered by a **local open-weight model**, checkpointing after
every chunk. In return you get a single tidy digest with a TL;DR, key
points, and action items for each file.

Built for the [Hacktoberfest Open-Source AI Challenge: Week 3 — Slow and
Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19) on DEV.

## Why a sloth?

Because the design is the joke *and* the engineering:

- **Small chunks.** A modest model on a modest laptop cannot swallow a
  40-page document. It can absolutely summarize 130 words. So Digest Sloth
  splits everything into bite-sized pieces and map-reduces them into a
  summary — slow, steady, and well within what local hardware can do.
- **Checkpoint everything.** After every chunk, progress is written to
  `.state/progress.json` (atomically, so a crash mid-write cannot corrupt
  it). Laptop slept? Battery died? Kid closed the terminal? Run it again —
  it resumes exactly where it stopped and never redoes finished work.
- **Local and open.** The model (Qwen2.5-0.5B-Instruct, Apache-2.0 weights)
  runs on your machine through [Transformers.js](https://github.com/huggingface/transformers.js).
  Your group chats and meeting notes never leave the device, it works with
  the Wi-Fi off, and it costs nothing to run — set it up once, never pay
  for it again. That is something no closed API can offer this use case.

## Quick start

Requirements: Node.js 22 or newer.

```bash
npm install

# Try it with the bundled samples (a team chat export + meeting notes):
npm run demo

# Then read the result:
cat out/digest.md

# Or read it in your browser:
npm run serve        # http://localhost:4173
```

The first run downloads the model (~750 MB, 4-bit quantized) into
`./.cache`. Every run after that is fully offline.

## Use it for real

1. Drop any `.txt` or `.md` files into `./inbox`.
2. Run `npm start` — ideally before you walk away from the machine.
3. Come back to `out/digest.md`.

Changed a file in the inbox? Its content hash changes, so only that file is
reprocessed. Everything else resumes from its checkpoints.

## How it works

```
inbox/*.txt, *.md
      │
      ▼
 chunker.ts ── split at sentence boundaries, ~130 words per chunk
      │
      ▼
 model.ts ──── Qwen2.5-0.5B-Instruct (local, open-weight) summarizes each chunk
      │        one at a time, with a breath in between
      ▼
 state.ts ──── checkpoint saved to disk after EVERY chunk
      │        (kill it, sleep it, crash it — resume is free)
      ▼
 map-reduce ── chunk summaries → per-file TL;DR + action items
      │
      ▼
 out/digest.md  (+ a zero-dependency web viewer via `npm run serve`)
```

## Configuration

| Variable      | Default                              | What it does                                  |
| ------------- | ------------------------------------ | --------------------------------------------- |
| `MODEL_ID`    | `onnx-community/Qwen2.5-0.5B-Instruct` | Any Transformers.js text-generation model. Try a 1.5B/3B Qwen on a beefier machine for sharper summaries and action items, or a smaller one on a weaker laptop. |
| `MODEL_DTYPE` | `q4`                                 | Quantization used when loading the model.     |
| `PACING_MS`   | `150`                                | Breathing room between chunks. Sloths are in no hurry. Set `0` if you are. |
| `PORT`        | `4173`                               | Port for the `npm run serve` digest viewer.   |

## Project structure

```
src/
  main.ts     CLI, processing loop, digest writer, web viewer
  chunker.ts  sentence-aware text splitting
  model.ts    local open-weight model wrapper (Transformers.js)
  state.ts    checkpoint load/save with content hashing
samples/      demo inputs (also used by `npm run demo`)
inbox/        drop your files here
out/          digest.md and digest.json land here
```

## The lazy payoff

A week of team chat and meeting notes is easily 5,000+ words you were never
going to re-read. Digest Sloth turns it into a structured brief — TL;DR,
key points, action-item checklist — while your laptop is idle. The bundled
demo (726 words across two files) takes about 75 seconds end-to-end on a
modest 2-core machine and makes 11 model calls; run it a second time and it
makes **zero** calls, because every chunk resumes from its checkpoint. That
is the real workflow: interrupt it as often as life requires; it does not
mind. It is a sloth.

One honest limitation: a 0.5B model occasionally attributes a point to the
wrong person or phrases an action item as a statement. The summaries are
faithful in substance, and pointing `MODEL_ID` at a larger open-weight
model improves the polish — the architecture does not change.

## License

MIT — see [LICENSE](LICENSE).
