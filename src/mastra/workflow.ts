/**
 * The digest pipeline as a Mastra workflow (Mastra partner integration).
 *
 * Mastra is a TypeScript agent/workflow framework. Here the exact same
 * pipeline as src/main.ts — chunk → summarise each chunk → synthesise —
 * is expressed as three typed Mastra steps with zod schemas, calling the
 * exact same local model functions (src/model.ts). It is an alternative
 * runner, not a fork: `npm run digest:mastra` produces
 * out/digest-mastra.md. The original runner stays untouched.
 *
 * Steps are plain functions under the hood, which is what makes this
 * honest: the workflow genuinely orchestrates the local Transformers.js
 * model — no cloud LLM hides inside the "agent framework" step.
 */
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { chunkText } from "../chunker.ts";
import { extractActions, summarizeChunk, summarizeFile } from "../model.ts";

const fileInput = z.object({ name: z.string(), content: z.string() });
const chunked = z.object({ name: z.string(), chunks: z.array(z.string()) });
const summarised = z.object({
  name: z.string(),
  chunkSummaries: z.array(z.string()),
});
const digested = z.object({
  name: z.string(),
  chunkSummaries: z.array(z.string()),
  finalSummary: z.string(),
  actions: z.array(z.string()),
});

const chunkStep = createStep({
  id: "chunk",
  description: "Split the file into ~130-word chunks at sentence boundaries",
  inputSchema: fileInput,
  outputSchema: chunked,
  execute: async ({ inputData }) => ({
    name: inputData.name,
    chunks: chunkText(inputData.content),
  }),
});

const summarizeStep = createStep({
  id: "summarize-chunks",
  description: "Summarise every chunk with the local open-weight model",
  inputSchema: chunked,
  outputSchema: summarised,
  execute: async ({ inputData }) => {
    const chunkSummaries: string[] = [];
    for (const chunk of inputData.chunks) {
      chunkSummaries.push(await summarizeChunk(chunk));
    }
    return { name: inputData.name, chunkSummaries };
  },
});

const synthesizeStep = createStep({
  id: "synthesize",
  description: "Map-reduce chunk summaries into a TL;DR plus action items",
  inputSchema: summarised,
  outputSchema: digested,
  execute: async ({ inputData }) => {
    const finalSummary = await summarizeFile(inputData.name, inputData.chunkSummaries);
    const actions = await extractActions(inputData.chunkSummaries);
    return {
      name: inputData.name,
      chunkSummaries: inputData.chunkSummaries,
      finalSummary,
      actions,
    };
  },
});

export const digestFileWorkflow = createWorkflow({
  id: "digest-file",
  inputSchema: fileInput,
  outputSchema: digested,
})
  .then(chunkStep)
  .then(summarizeStep)
  .then(synthesizeStep)
  .commit();

export type DigestedFile = z.infer<typeof digested>;

/** Run one file through the Mastra workflow. */
export async function digestWithMastra(name: string, content: string): Promise<DigestedFile> {
  const run = await digestFileWorkflow.createRun();
  const result = await run.start({ inputData: { name, content } });
  if (result.status !== "success") {
    throw new Error(`Mastra workflow ended with status "${result.status}" for ${name}`);
  }
  return result.result;
}
