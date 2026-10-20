/**
 * Optional Tiger Data semantic search (Tiger Data partner integration).
 *
 * Tiger Cloud is Postgres with pgvector. When TIGER_DATABASE_URL is set,
 * every digest run indexes its chunk summaries into Tiger: each summary
 * is embedded locally with Transformers.js (Xenova/all-MiniLM-L6-v2 —
 * the vectors are computed on this machine, only the finished embeddings
 * are stored) and `npm run ask -- "your question"` runs a pgvector
 * cosine-similarity search over everything the sloth has ever digested.
 *
 * Without TIGER_DATABASE_URL this module is a strict no-op.
 */
import { pipeline, env } from "@huggingface/transformers";
import path from "node:path";
import { Pool } from "pg";

import type { FileState } from "./state.ts";

env.cacheDir = path.resolve(process.cwd(), ".cache");

const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBED_DIM = 384;

type Extractor = (
  texts: string[],
  opts: Record<string, unknown>,
) => Promise<{ tolist: () => number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    // The generic pipeline() overloads explode TypeScript's union
    // resolution (TS2590) for feature-extraction; a narrow alias is the
    // pragmatic fix — runtime behaviour is identical.
    const pipelineFn = pipeline as unknown as (
      task: string,
      model: string,
      opts: Record<string, unknown>,
    ) => Promise<Extractor>;
    extractorPromise = pipelineFn("feature-extraction", EMBED_MODEL, { dtype: "q8" });
  }
  return extractorPromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

export function tigerEnabled(): boolean {
  return Boolean(process.env.TIGER_DATABASE_URL);
}

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.TIGER_DATABASE_URL });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  const p = getPool();
  await p.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await p.query(`
    CREATE TABLE IF NOT EXISTS digest_chunks (
      id bigserial PRIMARY KEY,
      file text NOT NULL,
      chunk_idx int NOT NULL,
      summary text NOT NULL,
      embedding vector(${EMBED_DIM}) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

const toVectorLiteral = (v: number[]) => `[${v.map((n) => n.toFixed(6)).join(",")}]`;

/** Index a finished digest run. Failures are logged, never fatal. */
export async function indexDigestInTiger(files: FileState[]): Promise<void> {
  if (!tigerEnabled()) return;
  try {
    await ensureSchema();
    const p = getPool();
    let count = 0;
    for (const f of files) {
      const summaries = f.chunks.map((c) => c.summary).filter((s): s is string => Boolean(s));
      if (!summaries.length) continue;
      const vectors = await embedTexts(summaries.map((s) => `${f.name}: ${s}`));
      await p.query(`DELETE FROM digest_chunks WHERE file = $1`, [f.name]);
      for (let i = 0; i < summaries.length; i++) {
        await p.query(
          `INSERT INTO digest_chunks (file, chunk_idx, summary, embedding) VALUES ($1, $2, $3, $4::vector)`,
          [f.name, i, summaries[i], toVectorLiteral(vectors[i])],
        );
        count++;
      }
    }
    console.log(`🐯 Indexed ${count} chunk summaries in Tiger Data (pgvector). Ask them things: npm run ask -- "..."`);
  } catch (err) {
    console.log(
      `🐯 Tiger indexing failed (${err instanceof Error ? err.message : String(err)}); digest itself is unaffected.`,
    );
  }
}

export interface TigerHit {
  file: string;
  chunk_idx: number;
  summary: string;
  score: number;
}

export async function searchTiger(query: string, k = 5): Promise<TigerHit[]> {
  await ensureSchema();
  const [vector] = await embedTexts([query]);
  const p = getPool();
  const res = await p.query(
    `SELECT file, chunk_idx, summary, 1 - (embedding <=> $1::vector) AS score
     FROM digest_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [toVectorLiteral(vector), k],
  );
  return res.rows as TigerHit[];
}

export async function closeTiger(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
