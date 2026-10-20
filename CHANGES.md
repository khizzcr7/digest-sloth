# Changes

## 20 October 2026 — partner-integration pass (inside the Week 3 window)

The original entry (core digest pipeline, Qwen2.5-0.5B-Instruct local
model, checkpointing, web viewer) was built 20 October 2026 earlier the
same day. The following were **added later on 20 October 2026**, still
inside the challenge entry window (19–25 Oct), and are recorded here as
the contest rules require for post-initial commits:

- **Gemma model option** (`--model gemma` / presets in `src/model.ts`):
  Google Gemma as a selectable local open-weight model alongside Qwen.
  Required upgrading `onnxruntime-node` to 1.30.0 via npm `overrides`
  (the version pinned by Transformers.js 3.8, 1.21.0, cannot load the
  current Gemma ONNX exports). See CATEGORIES.md for which Gemma build
  is verified working.
- **Sentry tracing** (`src/tracing.ts`): optional, `SENTRY_DSN`-gated.
- **Render + DigitalOcean deploys** (`render.yaml`, `.do/app.yaml`) and
  the viewer's bundled-sample fallback (`samples/digest-sample.md`) so a
  fresh deploy shows a real digest.
- **ElevenLabs narration** (`src/voice.ts`, `--voice`).
- **MongoDB Atlas history** (`src/history.ts`, `npm run history`).
- **SerpApi enrichment** (`src/enrich.ts`, `--enrich`).
- **Backboard compare** (`src/backboard.ts`, `src/compare.ts`, `npm run compare`).
- **Ultramarine cloud synthesis** (`src/ultramarine.ts`, `--cloud-synth`).
- **Browserbase/Stagehand URL input** (`src/urlfetch.ts`, `.url` inbox files).
- **Auth0 viewer login** (`src/auth.ts`, `AUTH0_*`-gated).
- **Tiger Data pgvector search** (`src/tiger.ts`, `src/ask.ts`, `npm run ask`).
- **Mastra workflow runner** (`src/mastra/`, `npm run digest:mastra`).
- **Temporal durable pipeline** (`src/temporal/`, `npm run temporal:worker` / `temporal:run`).
- **TabPFN priority prototype** (`scripts/tabpfn_priority.py`, `--priority`).
- **Tinker fine-tune dataset builder** (`scripts/tinker_finetune.py`).
- **Copilot instructions** (`.github/muse-instructions.md`).
- Housekeeping: `skipLibCheck` in tsconfig (library type noise),
  `typescript` devDependency for `tsc --noEmit` checks, `.gitignore`
  entries for the TabPFN venv and generated data.

CATEGORIES.md tracks, per prize category, what is integrated, what it
needs (env vars / accounts), and whether it is verified working.
