/**
 * Model layer: a local open-weight model running entirely on this machine
 * via Transformers.js.
 *
 * Two first-class presets:
 *   --model qwen   (default) onnx-community/Qwen2.5-0.5B-Instruct
 *                  Qwen2.5-0.5B-Instruct, Apache-2.0 weights, dtype q4.
 *   --model gemma  onnx-community/gemma-3-1b-it-ONNX
 *                  Google Gemma 3 1B instruction-tuned, open weights
 *                  under the Gemma licence, dtype q4. (The 270M build
 *                  loads but its ONNX export breaks inside generation
 *                  at realistic chunk lengths — see CATEGORIES.md — so
 *                  the verified preset is the 1B.)
 *
 * MODEL_ID / MODEL_DTYPE env vars still override everything, and
 * `--model <any-hf-id>` loads that model directly.
 *
 * No API keys, no cloud calls. After the one-time model download into
 * ./.cache, everything works offline.
 */
import { pipeline, env } from "@huggingface/transformers";
import path from "node:path";

import { traceModelCall } from "./tracing.ts";

env.cacheDir = path.resolve(process.cwd(), ".cache");

type DType = "auto" | "bnb4" | "fp16" | "fp32" | "int8" | "q4" | "q4f16" | "q8" | "uint8";

interface ModelPreset {
  id: string;
  dtype: DType;
  label: string;
}

const PRESETS: Record<string, ModelPreset> = {
  qwen: {
    id: "onnx-community/Qwen2.5-0.5B-Instruct",
    dtype: "q4",
    label: "Qwen2.5-0.5B-Instruct (local, open-weight)",
  },
  gemma: {
    id: "onnx-community/gemma-3-1b-it-ONNX",
    dtype: "q4",
    label: "Gemma 3 1B IT (local, open-weight)",
  },
};

function resolveModel(): ModelPreset {
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf("--model");
  const requested =
    (flagIdx >= 0 ? argv[flagIdx + 1] : undefined) ??
    process.env.MODEL_ID ??
    "qwen";
  const preset = PRESETS[requested.toLowerCase()];
  if (preset) {
    return {
      ...preset,
      dtype: (process.env.MODEL_DTYPE as DType | undefined) ?? preset.dtype,
    };
  }
  // A raw Hugging Face model id.
  return {
    id: requested,
    dtype: (process.env.MODEL_DTYPE as DType | undefined) ?? "q4",
    label: `${requested} (local, open-weight)`,
  };
}

const RESOLVED = resolveModel();
export const MODEL_ID = RESOLVED.id;
export const MODEL_DTYPE = RESOLVED.dtype;
export const MODEL_LABEL = RESOLVED.label;
const DTYPE = RESOLVED.dtype;

type Message = { role: string; content: string };
type Generator = (
  messages: Message[],
  opts: Record<string, unknown>,
) => Promise<Array<{ generated_text: Message[] }>>;

let generatorPromise: Promise<Generator> | null = null;

export function getGenerator(): Promise<Generator> {
  if (!generatorPromise) {
    // Narrow alias: the generic pipeline() overloads explode TS union
    // resolution (TS2590); runtime behaviour is identical.
    const pipelineFn = pipeline as unknown as (
      task: string,
      model: string,
      opts: Record<string, unknown>,
    ) => Promise<Generator>;
    generatorPromise = pipelineFn("text-generation", MODEL_ID, { dtype: DTYPE });
  }
  return generatorPromise;
}

const SYSTEM =
  "You are the engine inside Digest Sloth, a tool that digests documents. " +
  "You answer concisely and faithfully. You never invent facts that are not in the text. " +
  "You write plain, clear English and output exactly what is asked, with no preamble.";

async function chat(
  user: string,
  maxNewTokens = 160,
  kind: "chunk" | "file" | "actions" = "chunk",
): Promise<string> {
  return traceModelCall(kind, async () => {
    const gen = await getGenerator();
    const out = await gen(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { max_new_tokens: maxNewTokens, do_sample: false },
    );
    const messages = out[0]?.generated_text ?? [];
    const reply = messages[messages.length - 1]?.content ?? "";
    return reply.trim();
  });
}

/** Small models love labelling their own output ("TL:DR: ..."). Strip it. */
function stripLabelPrefix(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/^\**\s*(TL\s*[:;]?\s*DR|Summary)\s*:\s*/i, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Force multi-line model output into a single clean paragraph. */
function toParagraph(raw: string): string {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  return stripLabelPrefix(lines.join(" "));
}

/** One or two sentence summary of a single chunk of text. */
export async function summarizeChunk(chunk: string): Promise<string> {
  const raw = await chat(
    `Summarize the following text in one or two sentences. Output only the summary, as plain prose.\n\n${chunk}`,
    120,
    "chunk",
  );
  return toParagraph(raw);
}

/** Final per-file summary, built from the chunk summaries (map-reduce). */
export async function summarizeFile(
  title: string,
  chunkSummaries: string[],
): Promise<string> {
  if (chunkSummaries.length === 1) return chunkSummaries[0];
  const raw = await chat(
    `These are summaries of consecutive parts of a document called "${title}". ` +
      `Write a TL;DR of two or three sentences that covers the whole document. ` +
      `Write it as a single paragraph of plain prose, with no bullet points, lists, headings or labels.\n\n${chunkSummaries.join("\n")}`,
    160,
    "file",
  );
  return toParagraph(raw);
}

/** Action items / tasks / follow-ups mentioned in the file, or [] if none. */
export async function extractActions(chunkSummaries: string[]): Promise<string[]> {
  const raw = await chat(
    `From the notes below, list every concrete action item, task, or follow-up that someone still has to do, ` +
      `keeping the name of the person responsible when it is mentioned. Phrase each item as a short task starting with a verb. ` +
      `Skip general discussion points and things that are already finished. ` +
      `Output one item per line, each line starting with "- ". If there are none, output only NONE.\n\nNotes:\n${chunkSummaries.join("\n")}`,
    200,
    "actions",
  );
  if (/^none\.?$/i.test(raw)) return [];
  return raw
    .split("\n")
    .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((s) => s.length > 3 && !/^none/i.test(s));
}
