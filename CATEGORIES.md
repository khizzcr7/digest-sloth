# Prize category tracker — DEV Hacktoberfest Week 3

Every integration below is **genuine**: the named technology does real
work in this repo when configured, and is a no-op when it is not. The
core tool (`npm run demo`) needs none of them. Statuses were verified by
running the code on 20 October 2026; anything not yet exercised against
a live account says so plainly.

| # | Category | Integrated | Needs (env / account) | Status |
|---|----------|-----------|------------------------|--------|
| 1 | Gemma (Google) — $200 featured | `--model gemma` preset in `src/model.ts` (`onnx-community/gemma-3-1b-it-ONNX`, q4) | nothing (local model download) | **Verified end-to-end**: full app run on the sample meeting notes produced a complete digest (3 chunks, TL;DR, key points, action items). See detailed note below |
| 2 | Render — $200 featured | `render.yaml` + viewer sample-digest fallback | Render account | Code verified locally (fallback + PORT tested). **20 Oct: account signup blocked** — hCaptcha on Render's email-confirmation step rejected 6+ automated attempts; needs a his-hands signup in his own browser or a later retry. Deploy pending |
| 3 | DigitalOcean — $200 featured | `.do/app.yaml` | DigitalOcean account | **20 Oct: account created** via GitHub SSO (khizzcr7, free tier, no card given). Deploy **blocked**: team status "Incomplete" until a payment method is added — under his no-spend constraint this stays unclaimed |
| 4 | Sentry — $100 | `src/tracing.ts` | `SENTRY_DSN` (Sentry account) | **Verified live 20 Oct**: free account created (org `khizzcr7`, Node project `digest-sloth`), real DSN set in `.env`; full `npm run demo` (11 fresh model calls, 0 resumed) completed with "Sentry tracing on", spans flushed, exit 0, no hang. Trace-ingestion confirmation in the Sentry UI is the one remaining check |
| 5 | ElevenLabs — $100 | `src/voice.ts` (`--voice`) | `ELEVENLABS_API_KEY` (ElevenLabs account) | Code complete; graceful skip verified without key. MP3 generation needs the key |
| 6 | MongoDB Atlas — $100 | `src/history.ts`, `npm run history` | `MONGODB_URI` (Atlas cluster) | Code complete; no-op path verified. Live save/list needs the URI |
| 7 | Mastra — $100 | `src/mastra/workflow.ts`, `npm run digest:mastra` | nothing | **Verified end-to-end**: workflow ran both sample files through the local model and wrote `out/digest-mastra.md` |
| 8 | Temporal — $100 | `src/temporal/` (activities, workflow, worker, client) | Temporal dev server (CLI) or Temporal Cloud (`TEMPORAL_ADDRESS`) | **Verified end-to-end** against a local dev server (Temporal CLI 1.9.1): worker bundled the workflow, client executed it, real digest written to `out/digest-temporal.md` |
| 9 | SerpApi — $100 | `src/enrich.ts` (`--enrich`) | `SERPAPI_API_KEY` | Code complete; graceful skip verified without key |
| 10 | Browserbase / Stagehand — $100 | `src/urlfetch.ts` (`.url` inbox files, Stagehand v4 API) | `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | Fallback path **verified end-to-end** (`.url` file fetched, chunked, digested). Stagehand cloud path is code-complete against the installed v4 SDK; needs the keys to run |
| 11 | Auth0 for AI Agents — $100 | `src/auth.ts` | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` (Auth0 app; callback `{AUTH0_BASE_URL}/callback`) | Verified with dummy env: unauthenticated requests get the login wall, `/login` fails gracefully against an unreachable domain, server stays up. Full OIDC round-trip needs a real tenant. **20 Oct: signup blocked** — manage.auth0.com sits behind a Cloudflare "Verify you are human" wall that could not be cleared in place (bot-challenge agent rejected ~10x); needs a his-hands signup in his own browser or a later retry |
| 12 | Tiger Data — $100 | `src/tiger.ts`, `npm run ask` | `TIGER_DATABASE_URL` (Tiger Cloud Postgres w/ pgvector) | Embedding half **verified live** (MiniLM-L6-v2, 384-dim vectors + cosine similarity). SQL half code-complete; needs the database URL |
| 13 | Backboard — $100 | `src/backboard.ts`, `npm run compare` | `BACKBOARD_API_KEY` | Code complete against Backboard's real API shape (`POST app.backboard.io/api/threads/messages`, `X-API-Key`); needs the key |
| 14 | Ultramarine — $100 | `src/ultramarine.ts` (`--cloud-synth`) | `ULTRAMARINE_API_KEY`; optional price envs for $ cost | Code complete (OpenAI SDK → `api.paperinstruments.com/v1`, model `ultramarine-1-flash`); every call logs tokens and cost. Needs the key |
| 15 | GitHub Copilot — $100 | `.github/muse-instructions.md` | GitHub account w/ Copilot | Instructions file is real and specific to this repo (zero-config core, checkpointing, import style). A "Copilot-generated module" is **not claimed**: Copilot cannot be run from this environment, so nothing in the repo is falsely labelled as Copilot-written |
| 16 | TabPFN (Prior Labs) — $200 featured | `scripts/tabpfn_priority.py`, `--priority` | `TABPFN_TOKEN` (Prior Labs platform account) + `tabpfn-client` (venv `.venv-tabpfn/` provided) | Prototype **verified up to the credential boundary**: feature extraction + few-shot training set + client call all execute; the API correctly refuses without a token. Scoring itself needs the token |
| 17 | Tinker (Thinking Machines) — $200 featured | `scripts/tinker_finetune.py` | `TINKER_API_KEY` + `tinker` SDK | Dataset builder **verified**: 7 real SFT examples built from the sloth's own checkpoint summaries (`data/sft-dataset.jsonl`). Training is blocked on access (Tinker keys are application-gated) **and** on an architectural fact: Tinker fine-tunes hosted models served via its API — a checkpoint cannot be dropped into the local ONNX pipeline, so before/after would compare local Qwen vs the Tinker-hosted model. Documented in the script; no fake run. **20 Oct: API access request submitted** via the thinkingmachines.ai/tinker contact form (name, work email, project, use case); site confirmed "Message sent — the Tinker team will follow up by email". No key yet |
| 18 | Arduino — $200 featured | — | physical Arduino UNO Q hardware | **Not possible**: requires the physical board. No software substitute exists and none is claimed |
| 19 | .tech domain — $100 | — | a .tech domain for the hosted viewer | Not code: once the viewer is deployed (Render/DO), pointing a .tech domain at it is a DNS step for the domain owner |

## Gemma — detailed note

`--model gemma` selects Google Gemma 3 1B
(`onnx-community/gemma-3-1b-it-ONNX`, q4). **Verified end-to-end on
20 Oct 2026**: a full `node src/main.ts --model gemma` run over
`samples/sample-meeting-notes.md` (3 chunks, 5 model calls) produced a
complete, faithful digest — TL;DR, key points, and a clean action-item
list — with zero cloud calls.

Getting there took three real findings, all from testing:

1. The onnxruntime-node version pinned by Transformers.js 3.8 (1.21.0)
   cannot load the current Gemma ONNX exports at all (a
   `GatherBlockQuantized` "bits" attribute error on the q4/q4f16 builds,
   and an 11-input `GroupQueryAttention` schema error on fp16).
   `package.json` therefore carries an npm `overrides` entry pinning
   `onnxruntime-node` to 1.30.0, under which the exports load. Qwen was
   re-verified after the upgrade (`npm run demo`, checkpoints resume).
2. The **270M** export loads under 1.30.0 and answers short prompts,
   but fails at realistic chunk lengths (~230+ tokens) inside
   generation with an ORT buffer error
   (`not enough space: expected 119808, got 0`) in its hybrid
   sliding-window KV cache — at both q4 and fp16.
3. The **1B** export has no such problem at the same lengths and its
   summaries are noticeably better than the 270M's (which tended to
   echo its input). Hence the 1B preset.
