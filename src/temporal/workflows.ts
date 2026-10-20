/**
 * Temporal workflow for the digest pipeline (Temporal partner
 * integration).
 *
 * The same job as src/main.ts — chunk, summarise, synthesise — expressed
 * as a durable Temporal workflow. If the worker dies halfway through a
 * 40-chunk file, Temporal resumes the workflow where it stopped and the
 * finished chunk summaries (recorded in the workflow history) are never
 * recomputed. It is the checkpoint idea from state.ts, promoted to a
 * distributed-systems guarantee.
 *
 * This file runs inside Temporal's deterministic workflow sandbox: it
 * may only import from @temporalio/workflow plus type-only imports.
 */
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities.ts";

const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export interface DigestFileInput {
  name: string;
  content: string;
}

export interface DigestFileOutput {
  name: string;
  chunkSummaries: string[];
  finalSummary: string;
  actions: string[];
}

export async function digestFileWorkflow(
  input: DigestFileInput,
): Promise<DigestFileOutput> {
  const chunks = await acts.chunkFileActivity(input.content);
  // Chunk summaries are independent — run them as parallel activities.
  const chunkSummaries = await Promise.all(
    chunks.map((chunk) => acts.summarizeChunkActivity(chunk)),
  );
  const synthesis = await acts.synthesizeFileActivity(input.name, chunkSummaries);
  return {
    name: input.name,
    chunkSummaries,
    finalSummary: synthesis.finalSummary,
    actions: synthesis.actions,
  };
}

export async function digestWorkflow(
  files: DigestFileInput[],
): Promise<DigestFileOutput[]> {
  const out: DigestFileOutput[] = [];
  for (const file of files) {
    out.push(await digestFileWorkflow(file));
  }
  return out;
}
