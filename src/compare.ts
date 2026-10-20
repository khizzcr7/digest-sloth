/**
 * `npm run compare` — local model vs Backboard, same chunk, both
 * summaries written to out/compare.md. See src/backboard.ts.
 */
import fs from "node:fs";
import path from "node:path";

import { summarizeWithBackboard } from "./backboard.ts";
import { chunkText } from "./chunker.ts";
import { MODEL_ID, summarizeChunk } from "./model.ts";

async function main(): Promise<void> {
  if (!process.env.BACKBOARD_API_KEY) {
    console.log("BACKBOARD_API_KEY is not set — the compare run needs it. See CATEGORIES.md.");
    process.exit(2);
  }
  const inbox = path.resolve(process.cwd(), "inbox");
  const sample = path.resolve(process.cwd(), "samples", "sample-meeting-notes.md");
  const names = fs.existsSync(inbox)
    ? fs.readdirSync(inbox).filter((f) => /\.(txt|md)$/i.test(f)).sort()
    : [];
  const sourcePath = names.length ? path.join(inbox, names[0]) : sample;
  const content = fs.readFileSync(sourcePath, "utf8");
  const chunk = chunkText(content)[0];
  if (!chunk) throw new Error("No chunkable text found.");

  console.log(`🔬 Comparing on the first chunk of ${path.basename(sourcePath)} (${chunk.length} chars)`);

  const t0 = Date.now();
  const local = await summarizeChunk(chunk);
  const localMs = Date.now() - t0;

  const t1 = Date.now();
  const remote = await summarizeWithBackboard(chunk);
  const remoteMs = Date.now() - t1;

  const report = [
    `# 🔬 Model compare — local vs Backboard`,
    ``,
    `_Chunk: first chunk of ${path.basename(sourcePath)} (${chunk.length} characters)._`,
    ``,
    `## Local — ${MODEL_ID} (${(localMs / 1000).toFixed(1)}s, $0)`,
    ``,
    local,
    ``,
    `## Backboard — ${process.env.BACKBOARD_MODEL_NAME ?? "Backboard default model"} (${(remoteMs / 1000).toFixed(1)}s, via API)`,
    ``,
    remote,
    ``,
  ].join("\n");

  const outPath = path.resolve(process.cwd(), "out", "compare.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report);
  console.log(report);
  console.log(`✅ Compare report written to out/compare.md`);
}

main().catch((err) => {
  console.error("💥 Compare failed:", err);
  process.exit(1);
});
