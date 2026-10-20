/**
 * `npm run ask -- "what did we decide about the budget?"`
 * Semantic search over past digests stored in Tiger Data (pgvector).
 * See src/tiger.ts. Requires TIGER_DATABASE_URL.
 */
import { closeTiger, searchTiger } from "./tiger.ts";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (!process.env.TIGER_DATABASE_URL) {
    console.log("TIGER_DATABASE_URL is not set — ask-your-digests needs it. See CATEGORIES.md.");
    process.exit(2);
  }
  if (!query) {
    console.log('Usage: npm run ask -- "your question"');
    process.exit(2);
  }
  const hits = await searchTiger(query, 5);
  if (!hits.length) {
    console.log("No indexed digests yet. Run a digest with TIGER_DATABASE_URL set first.");
  }
  for (const h of hits) {
    console.log(`\n[${h.score.toFixed(3)}] ${h.file} · chunk ${h.chunk_idx + 1}`);
    console.log(`  ${h.summary}`);
  }
  await closeTiger();
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Ask failed:", err);
  process.exit(1);
});
