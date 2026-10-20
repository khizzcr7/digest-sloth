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
- **Local and open.** The model runs on your machine through
  [Transformers.js](https://github.com/huggingface/transformers.js) —
  pick **Qwen2.5-0.5B-Instruct** (Apache-2.0 weights) or **Google Gemma 3**
  with `--model gemma`. Your group chats and meeting notes never leave
  the device, it works with the Wi-Fi off, and it costs nothing to run —
  set it up once, never pay for it again. That is something no closed API
  can offer this use case.

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

Hosted demo: `render.yaml` (Render) and `.do/app.yaml` (DigitalOcean App
Platform) both deploy the viewer as-is. On a fresh deploy with no digest
generated yet, the viewer serves the bundled `samples/digest-sample.md`,
so the live demo always shows a real digest.

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
| `MODEL_ID`    | `onnx-community/Qwen2.5-0.5B-Instruct` | Any Transformers.js text-generation model. Try a 1.5B/3B Qwen on a beefier machine for sharper summaries and action items, or a smaller one on a weaker laptop. `--model qwen` / `--model gemma` (or any HF id) on the CLI does the same job. |
| `MODEL_DTYPE` | `q4`                                 | Quantization used when loading the model.     |
| `PACING_MS`   | `150`                                | Breathing room between chunks. Sloths are in no hurry. Set `0` if you are. |
| `PORT`        | `4173`                               | Port for the `npm run serve` digest viewer.   |

## Partner integrations (all optional, all off by default)

Digest Sloth's core is local and zero-config. For the Hacktoberfest
challenge's partner categories it also grows a set of **genuine,
env-gated integrations** — each one does real work when configured and
is a strict no-op when it is not. CATEGORIES.md has the per-category
detail (what it does, what it needs, verified status).

| Integration | Enable with | What it does |
| --- | --- | --- |
| Google Gemma | `--model gemma` | Runs the whole pipeline on Gemma 3 instead of Qwen (still 100% local). |
| Sentry | `SENTRY_DSN` | One trace per digest run, a span per model call. |
| Render | `render.yaml` | One-click deploy of the web viewer. |
| DigitalOcean | `.do/app.yaml` | Same viewer on App Platform. |
| ElevenLabs | `--voice` + `ELEVENLABS_API_KEY` | Narrates the TL;DRs to `out/digest.mp3`. |
| MongoDB Atlas | `MONGODB_URI` | Saves every digest to a history collection; `npm run history` lists them. |
| Mastra | `npm run digest:mastra` | The same pipeline as a typed Mastra workflow (chunk → summarise → synthesise). |
| Temporal | `npm run temporal:worker` + `temporal:run` | The pipeline as a durable Temporal workflow against a local dev server or Temporal Cloud. |
| SerpApi | `--enrich` + `SERPAPI_API_KEY` | Appends live web context for the top action items. |
| Browserbase / Stagehand | `.url` inbox files + `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | Fetches pages with a real cloud browser into the pipeline (plain-fetch fallback without keys). |
| Auth0 | `AUTH0_DOMAIN` + `AUTH0_CLIENT_ID` + `AUTH0_CLIENT_SECRET` | Login-protects the hosted viewer (OIDC + PKCE). |
| Tiger Data | `TIGER_DATABASE_URL` | pgvector index of chunk summaries; `npm run ask -- "..."` searches past digests semantically. |
| Backboard | `npm run compare` + `BACKBOARD_API_KEY` | Side-by-side summary: local model vs Backboard's API. |
| Ultramarine | `--cloud-synth` + `ULTRAMARINE_API_KEY` | Final TL;DR synthesis via Ultramarine (only summaries leave the machine); logs tokens + cost. |
| TabPFN | `--priority` + `TABPFN_TOKEN` | Few-shot priority scoring of action items (`scripts/tabpfn_priority.py`). |
| Tinker | `python3 scripts/tinker_finetune.py` | Builds a real SFT dataset from the sloth's own summaries; training run is access-gated (see CATEGORIES.md). |
| GitHub Copilot | `.github/muse-instructions.md` | Repo instructions Copilot uses for chat, review and the coding agent. |

Arduino is the one category with no integration: it needs physical
Arduino UNO Q hardware, which no amount of code can substitute for.

## Project structure

```
src/
  main.ts     CLI, processing loop, digest writer, web viewer
  chunker.ts  sentence-aware text splitting
  model.ts    local open-weight model wrapper (Transformers.js)
  state.ts    checkpoint load/save with content hashing
  tracing.ts  optional Sentry tracing (SENTRY_DSN)
  voice.ts    optional ElevenLabs narration (--voice)
  enrich.ts   optional SerpApi web context (--enrich)
  history.ts  optional MongoDB Atlas digest history (MONGODB_URI)
  ultramarine.ts  optional Ultramarine cloud synthesis (--cloud-synth)
  backboard.ts + compare.ts   local-vs-Backboard compare run
  urlfetch.ts Browserbase/Stagehand .url inbox fetcher
  auth.ts     optional Auth0 login for the viewer (AUTH0_*)
  tiger.ts + ask.ts   Tiger Data pgvector "ask your digests"
  priority.ts TabPFN priority scoring wrapper (--priority)
  mastra/     the pipeline as a Mastra workflow (npm run digest:mastra)
  temporal/   the pipeline as a Temporal workflow (worker + client)
scripts/
  tabpfn_priority.py    TabPFN few-shot action-item priority scoring
  tinker_finetune.py    SFT dataset builder for a Tinker fine-tune
samples/      demo inputs (also used by `npm run demo`)
inbox/        drop your files here (.txt, .md, or .url)
out/          digest.md and digest.json land here
render.yaml / .do/app.yaml    hosted viewer deploys
CATEGORIES.md   per-prize-category integration status
CHANGES.md      dated change log (hackathon rules compliance)
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
