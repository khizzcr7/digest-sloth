/**
 * Temporal client for the digest pipeline. Run with:
 *   npm run temporal:run        (worker must be running: npm run temporal:worker)
 *
 * Reads the inbox, starts the digestWorkflow on the Temporal server,
 * waits for it, and writes the result to out/digest-temporal.md.
 */
import { Client, Connection } from "@temporalio/client";
import fs from "node:fs";
import path from "node:path";

import { digestWorkflow, type DigestFileInput } from "./workflows.ts";
import { TASK_QUEUE } from "./common.ts";

async function main(): Promise<void> {
  const inbox = path.resolve(process.cwd(), "inbox");
  const names = fs
    .readdirSync(inbox)
    .filter((f) => /\.(txt|md)$/i.test(f))
    .sort();
  if (!names.length) {
    console.log("Inbox is empty — nothing to send to Temporal.");
    return;
  }
  const files: DigestFileInput[] = names.map((name) => ({
    name,
    content: fs.readFileSync(path.join(inbox, name), "utf8"),
  }));

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  try {
    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    });
    console.log(`⏳ Starting digestWorkflow for ${files.length} file(s)...`);
    const results = await client.workflow.execute(digestWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: `digest-${Date.now()}`,
      args: [files],
    });

    const lines: string[] = [`# 🦥 Your Digest (via Temporal)`, ``];
    for (const r of results) {
      lines.push(`## ${r.name}`, ``, `**TL;DR:** ${r.finalSummary}`, ``);
      if (r.actions.length) {
        lines.push(`**Action items:**`, ``);
        for (const a of r.actions) lines.push(`- [ ] ${a}`);
        lines.push(``);
      }
    }
    const outPath = path.resolve(process.cwd(), "out", "digest-temporal.md");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, lines.join("\n"));
    console.log(`✅ Temporal digest written to out/digest-temporal.md`);
  } finally {
    await connection.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Temporal client failed:", err);
  process.exit(1);
});
