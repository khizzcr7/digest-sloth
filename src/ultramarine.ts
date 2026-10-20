/**
 * Optional Ultramarine cloud synthesis (Ultramarine partner integration,
 * by Paper Instruments).
 *
 * The sloth's one weakness is the final synthesis: a 0.5B local model
 * stitching chunk summaries into a TL;DR. With `--cloud-synth` on the CLI
 * and ULTRAMARINE_API_KEY set, that one step (and only that step) is done
 * by Ultramarine's hosted model through its OpenAI-compatible API. All
 * chunk summaries still happen locally; your raw notes never leave the
 * machine — only the already-summarised chunks are sent.
 *
 * Every cloud call logs its token usage and cost. Cost is computed from
 * ULTRAMARINE_INPUT_USD_PER_MTOK / ULTRAMARINE_OUTPUT_USD_PER_MTOK when
 * set (prices change; we never hard-code a stale price as fact).
 */
import OpenAI from "openai";

const BASE_URL = process.env.ULTRAMARINE_BASE_URL ?? "https://api.paperinstruments.com/v1";
const MODEL = process.env.ULTRAMARINE_MODEL ?? "ultramarine-1-flash";

export interface CloudSynthResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export function cloudSynthEnabled(): boolean {
  return Boolean(process.env.ULTRAMARINE_API_KEY);
}

function costFor(promptTokens: number, completionTokens: number): number | null {
  const inRate = Number(process.env.ULTRAMARINE_INPUT_USD_PER_MTOK ?? NaN);
  const outRate = Number(process.env.ULTRAMARINE_OUTPUT_USD_PER_MTOK ?? NaN);
  if (!Number.isFinite(inRate) || !Number.isFinite(outRate)) return null;
  return (promptTokens / 1_000_000) * inRate + (completionTokens / 1_000_000) * outRate;
}

/**
 * Final per-file TL;DR via Ultramarine, or null when the integration is
 * not configured (caller falls back to the local model).
 */
export async function synthesizeWithUltramarine(
  title: string,
  chunkSummaries: string[],
): Promise<CloudSynthResult | null> {
  const apiKey = process.env.ULTRAMARINE_API_KEY;
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are the synthesis step inside Digest Sloth. You write plain, clear English, " +
          "you never invent facts that are not in the text, and you output exactly what is asked.",
      },
      {
        role: "user",
        content:
          `These are summaries of consecutive parts of a document called "${title}". ` +
          `Write a TL;DR of two or three sentences that covers the whole document. ` +
          `Write it as a single paragraph of plain prose, with no bullet points, lists, headings or labels.\n\n${chunkSummaries.join("\n")}`,
      },
    ],
  });
  const text = (completion.choices[0]?.message?.content ?? "").trim();
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = costFor(promptTokens, completionTokens);
  console.log(
    `   ☁️ Ultramarine synthesis (${MODEL}): ${promptTokens} in / ${completionTokens} out tokens` +
      (costUsd !== null
        ? `, cost $${costUsd.toFixed(6)}`
        : ", cost: set ULTRAMARINE_INPUT_USD_PER_MTOK / ULTRAMARINE_OUTPUT_USD_PER_MTOK to price tokens"),
  );
  return { text, model: MODEL, promptTokens, completionTokens, costUsd };
}
