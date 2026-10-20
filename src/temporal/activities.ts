/**
 * Temporal activities for the digest pipeline (Temporal partner
 * integration). Activities are the "real world" side of Temporal: they
 * do the non-deterministic work — here, calling the local model.
 * See workflows.ts for the orchestration and CATEGORIES.md for how to
 * run the whole thing.
 */
import { chunkText } from "../chunker.ts";
import { extractActions, summarizeChunk, summarizeFile } from "../model.ts";

export async function chunkFileActivity(content: string): Promise<string[]> {
  return chunkText(content);
}

export async function summarizeChunkActivity(text: string): Promise<string> {
  return summarizeChunk(text);
}

export interface Synthesis {
  finalSummary: string;
  actions: string[];
}

export async function synthesizeFileActivity(
  name: string,
  chunkSummaries: string[],
): Promise<Synthesis> {
  const finalSummary = await summarizeFile(name, chunkSummaries);
  const actions = await extractActions(chunkSummaries);
  return { finalSummary, actions };
}
