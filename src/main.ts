/**
 * Digest Sloth 🦥
 *
 * Drop .txt / .md files into ./inbox (team chat exports, meeting notes,
 * long documents you keep meaning to read). Digest Sloth works through
 * them slowly — one small chunk at a time, checkpointing after each one —
 * and leaves you a single digest.md with a TL;DR, key points, and action
 * items per file.
 *
 * Everything runs locally on an open-weight model. Your chats and notes
 * never leave the machine, it works offline, and it costs nothing to run.
 *
 * Usage:
 *   node src/main.ts           process the inbox, write out/digest.md
 *   node src/main.ts --demo    seed the inbox with samples first, then run
 *   node src/main.ts --serve   process, then serve the digest in a browser
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { chunkText, countWords } from "./chunker.ts";
import { extractActions, MODEL_ID, summarizeChunk, summarizeFile } from "./model.ts";
import { hashContent, loadState, saveState, type FileState } from "./state.ts";

const ROOT = process.cwd();
const INBOX = path.join(ROOT, "inbox");
const SAMPLES = path.join(ROOT, "samples");
const OUT_DIR = path.join(ROOT, "out");
const DIGEST_MD = path.join(OUT_DIR, "digest.md");
const PACING_MS = Number(process.env.PACING_MS ?? 150);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let freshModelCalls = 0;
let resumedChunks = 0;

async function processFile(name: string, state: ReturnType<typeof loadState>): Promise<FileState> {
  const content = fs.readFileSync(path.join(INBOX, name), "utf8");
  const hash = hashContent(content);

  let file = state.files[name];
  if (!file || file.hash !== hash) {
    file = {
      name,
      hash,
      chunks: chunkText(content).map((text) => ({ text, summary: null })),
      finalSummary: null,
      actions: null,
      done: false,
    };
    state.files[name] = file;
    saveState(state);
  }

  const total = file.chunks.length;
  for (let i = 0; i < total; i++) {
    const chunk = file.chunks[i];
    if (chunk.summary) {
      resumedChunks++;
      continue;
    }
    chunk.summary = await summarizeChunk(chunk.text);
    freshModelCalls++;
    saveState(state); // checkpoint after EVERY chunk — slow and steady wins
    console.log(`  🦥 ${name} · chunk ${i + 1}/${total} saved`);
    if (PACING_MS > 0) await sleep(PACING_MS);
  }

  if (!file.done) {
    const summaries = file.chunks.map((c) => c.summary ?? "");
    file.finalSummary = await summarizeFile(name, summaries);
    freshModelCalls++;
    file.actions = await extractActions(summaries);
    freshModelCalls++;
    file.done = true;
    saveState(state);
  }
  return file;
}

function renderDigest(files: FileState[], generatedAt: Date): string {
  const lines: string[] = [
    `# 🦥 Your Digest`,
    ``,
    `_Generated ${generatedAt.toLocaleString()} by Digest Sloth, running ${MODEL_ID} locally. ` +
      `${files.length} file(s), ${files.reduce((n, f) => n + f.chunks.length, 0)} chunks, zero cloud calls._`,
    ``,
  ];
  for (const f of files) {
    lines.push(`## ${f.name}`, ``, `**TL;DR:** ${f.finalSummary ?? ""}`, ``);
    if (f.chunks.length > 1) {
      lines.push(`**Key points:**`, ``);
      for (const c of f.chunks) lines.push(`- ${c.summary}`);
      lines.push(``);
    }
    if (f.actions && f.actions.length) {
      lines.push(`**Action items:**`, ``);
      for (const a of f.actions) lines.push(`- [ ] ${a}`);
      lines.push(``);
    }
  }
  return lines.join("\n");
}

/** Deliberately tiny Markdown -> HTML for the built-in viewer. */
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const out: string[] = [];
  let inList = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("- [ ] ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>☐ ${inline(line.slice(6))}</li>`);
    } else if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
      else if (line.startsWith("# ")) out.push(`<h1>${inline(line.slice(2))}</h1>`);
      else if (line.startsWith("_") && line.endsWith("_")) out.push(`<p><em>${inline(line.slice(1, -1))}</em></p>`);
      else if (line) out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return `<!doctype html><meta charset="utf-8"><title>Digest Sloth</title>
<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1c2520}h1{font-size:1.7rem}h2{margin-top:2rem;border-bottom:2px solid #dce8dd;padding-bottom:.3rem}li{margin:.25rem 0}</style>
${out.join("\n")}`;
}

function seedDemoInbox(): void {
  fs.mkdirSync(INBOX, { recursive: true });
  const existing = fs.readdirSync(INBOX).filter((f) => /\.(txt|md)$/i.test(f));
  if (existing.length) return;
  for (const f of fs.readdirSync(SAMPLES)) {
    fs.copyFileSync(path.join(SAMPLES, f), path.join(INBOX, f));
    console.log(`  📥 seeded inbox with sample: ${f}`);
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--demo")) seedDemoInbox();

  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const names = fs
    .readdirSync(INBOX)
    .filter((f) => /\.(txt|md)$/i.test(f))
    .sort();

  if (!names.length) {
    console.log("🦥 Inbox is empty. Drop .txt or .md files into ./inbox and run again,");
    console.log("   or try the demo:  npm run demo");
    return;
  }

  const started = Date.now();
  const state = loadState();
  console.log(`🦥 Digest Sloth waking up. Model: ${MODEL_ID} (local, open-weight)`);
  console.log(`   ${names.length} file(s) in the inbox. Going slowly, on purpose.\n`);

  const files: FileState[] = [];
  let sourceWords = 0;
  for (const name of names) {
    console.log(`📄 ${name}`);
    sourceWords += countWords(fs.readFileSync(path.join(INBOX, name), "utf8"));
    files.push(await processFile(name, state));
  }

  const digest = renderDigest(files, new Date());
  fs.writeFileSync(DIGEST_MD, digest);
  fs.writeFileSync(path.join(OUT_DIR, "digest.json"), JSON.stringify(files, null, 2));

  const digestWords = countWords(digest);
  const readingSaved = Math.max(0, Math.round(sourceWords / 200 - digestWords / 200));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n✅ Digest written to out/digest.md`);
  console.log(`   Model calls this run: ${freshModelCalls} fresh, ${resumedChunks} chunks resumed from checkpoints`);
  console.log(`   Source: ~${sourceWords} words → digest: ~${digestWords} words. Roughly ${readingSaved} minute(s) of reading, done by a sloth. (${seconds}s wall time)`);

  if (args.has("--serve")) {
    const port = Number(process.env.PORT ?? 4173);
    http
      .createServer((req, res) => {
        if (req.url === "/digest.md") {
          res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
          res.end(fs.readFileSync(DIGEST_MD, "utf8"));
        } else {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(mdToHtml(fs.readFileSync(DIGEST_MD, "utf8")));
        }
      })
      .listen(port, () => console.log(`\n🌿 Read it in your browser: http://localhost:${port}`));
  }
}

main().catch((err) => {
  console.error("💥 Digest Sloth stumbled:", err);
  process.exit(1);
});
