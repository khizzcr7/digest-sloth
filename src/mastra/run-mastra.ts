/**
 * `npm run digest:mastra` — run the inbox through the Mastra workflow
 * version of the pipeline (see src/mastra/workflow.ts) and write
 * out/digest-mastra.md. The original runner (`npm start`) is untouched.
 */
import fs from "node:fs";
import path from "node:path";

import { MODEL_ID } from "../model.ts";
import { digestWithMastra, type DigestedFile } from "./workflow.ts";

async function main(): Promise<void> {
  const inbox = path.resolve(process.cwd(), "inbox");
  const names = fs
    .readdirSync(inbox)
    .filter((f) => /\.(txt|md)$/i.test(f))
    .sort();
  if (!names.length) {
    console.log("Inbox is empty — nothing for Mastra to digest.");
    return;
  }
  console.log(`🦥 Digest Sloth via Mastra. Model: ${MODEL_ID} (local, open-weight)`);
  const results: DigestedFile[] = [];
  for (const name of names) {
    console.log(`📄 ${name}`);
    const content = fs.readFileSync(path.join(inbox, name), "utf8");
    results.push(await digestWithMastra(name, content));
  }

  const lines: string[] = [
    `# 🦥 Your Digest (via Mastra)`,
    ``,
    `_Generated ${new Date().toLocaleString()} by the Mastra workflow runner, running ${MODEL_ID} locally._`,
    ``,
  ];
  for (const r of results) {
    lines.push(`## ${r.name}`, ``, `**TL;DR:** ${r.finalSummary}`, ``);
    if (r.chunkSummaries.length > 1) {
      lines.push(`**Key points:**`, ``);
      for (const s of r.chunkSummaries) lines.push(`- ${s}`);
      lines.push(``);
    }
    if (r.actions.length) {
      lines.push(`**Action items:**`, ``);
      for (const a of r.actions) lines.push(`- [ ] ${a}`);
      lines.push(``);
    }
  }
  const outPath = path.resolve(process.cwd(), "out", "digest-mastra.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`\n✅ Mastra digest written to out/digest-mastra.md`);
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Mastra runner failed:", err);
  process.exit(1);
});
