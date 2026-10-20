/**
 * Optional MongoDB Atlas digest history (MongoDB partner integration).
 *
 * When MONGODB_URI is set, every digest run also saves a record to the
 * `digests` collection of the `digest-sloth` database: timestamp, model,
 * source file names, per-file TL;DRs and action items, and the full
 * digest Markdown. `npm run history` lists past digests newest-first.
 *
 * Without MONGODB_URI this module is a strict no-op.
 */
import { MongoClient, type Collection, type Document } from "mongodb";

import type { FileState } from "./state.ts";
import { MODEL_ID } from "./model.ts";

export interface DigestRecord extends Document {
  generatedAt: Date;
  model: string;
  sources: string[];
  files: Array<{ name: string; tldr: string | null; actions: string[] | null }>;
  digest: string;
}

async function getCollection(): Promise<Collection<DigestRecord>> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  // Keep the client alive for the life of this short CLI process; it is
  // closed when the process exits.
  return client.db("digest-sloth").collection<DigestRecord>("digests");
}

export function historyEnabled(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/** Save one digest record. Failures are logged, never fatal. */
export async function saveDigestHistory(files: FileState[], digestMd: string): Promise<void> {
  if (!historyEnabled()) return;
  try {
    const col = await getCollection();
    await col.insertOne({
      generatedAt: new Date(),
      model: MODEL_ID,
      sources: files.map((f) => f.name),
      files: files.map((f) => ({
        name: f.name,
        tldr: f.finalSummary,
        actions: f.actions,
      })),
      digest: digestMd,
    });
    console.log("🗄️  Digest saved to MongoDB Atlas history (database: digest-sloth).");
  } catch (err) {
    console.log(
      `🗄️  MongoDB history save failed (${err instanceof Error ? err.message : String(err)}); digest itself is unaffected.`,
    );
  }
}

export async function listDigestHistory(limit = 10): Promise<DigestRecord[]> {
  const col = await getCollection();
  return col.find({}).sort({ generatedAt: -1 }).limit(limit).toArray();
}
