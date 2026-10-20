/**
 * `npm run history` — list past digests stored in MongoDB Atlas.
 * See src/history.ts. Requires MONGODB_URI.
 */
import { listDigestHistory } from "./history.ts";

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.log("MONGODB_URI is not set — digest history needs it. See CATEGORIES.md.");
    process.exit(2);
  }
  const records = await listDigestHistory(10);
  if (!records.length) {
    console.log("No digests stored yet. Run `npm run demo` with MONGODB_URI set first.");
    return;
  }
  for (const r of records) {
    console.log(`\n📄 ${r.generatedAt.toISOString()} — ${r.sources.join(", ")} (model: ${r.model})`);
    for (const f of r.files) {
      if (f.tldr) console.log(`   ${f.name}: ${f.tldr}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 History failed:", err);
  process.exit(1);
});
