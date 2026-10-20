# Copilot instructions for Digest Sloth

These instructions are used by GitHub Copilot (chat, code review, and the
coding agent) whenever it works in this repository.

## Project

Digest Sloth is a small TypeScript / Node.js CLI that digests local text
files (meeting notes, chat exports) into a single Markdown digest using a
**local open-weight model** via Transformers.js. Privacy is the point:
with no optional integrations enabled, nothing leaves the machine.

## Hard rules

- **Zero-config core.** Every integration (Sentry, MongoDB, Temporal,
  Stagehand, Auth0, cloud models, ...) must stay optional and env-gated.
  `npm run demo` must work on a fresh clone with no environment variables
  set and no network access after `npm install`.
- **Node 22+ native TypeScript.** Source files are `.ts` executed directly
  by Node (`node src/main.ts`). Do not add a build step or a transpiler.
  Relative imports must include the `.ts` extension
  (`import { x } from "./chunker.ts"`).
- **No heavy dependencies for small jobs.** Prefer `node:` built-ins and
  `fetch`. The web viewer in `src/main.ts` is deliberately dependency-free.
- **Checkpointing is sacred.** `src/state.ts` writes progress atomically
  (tmp file + rename) after every chunk. Never batch or defer these saves;
  resume-after-crash is the product's core promise.
- **Honesty in output.** Model prompts must instruct the model to never
  invent facts not present in the source text. Keep that instruction in
  any new prompt you write.

## Style

- Plain, friendly comments that explain *why*, not *what*.
- Small modules with a single job: `chunker.ts` (splitting), `model.ts`
  (local model), `state.ts` (checkpoints), one module per integration.
- JSDoc header at the top of each new module saying what it does, which
  environment variables enable it, and what happens when they are absent.
- Errors in optional integrations must degrade gracefully: log one clear
  line and continue the digest run. A failed bonus integration must never
  fail the digest itself.

## Testing

- After any change: `npm run demo` must pass (it resumes from checkpoints,
  so it is fast) and `npx tsc --noEmit` must be clean.
- If you add a code path, exercise it for real — do not leave untested
  branches described as "should work".
