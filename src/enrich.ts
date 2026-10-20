/**
 * Optional SerpApi web enrichment (SerpApi partner integration).
 *
 * With `--enrich` on the CLI and SERPAPI_API_KEY set, the digest's top
 * action items are looked up on the live web via SerpApi's Google Search
 * API, and a "Web context" section is appended to the digest: for each
 * action item, the top results (title + link + snippet) so vague items
 * like "look into the new SOC 2 rules" arrive with homework attached.
 *
 * Without the key (or the flag) this is a no-op and the digest stays
 * 100% local.
 */

interface SerpResult {
  title: string;
  link: string;
  snippet: string;
}

async function searchSerpApi(query: string, apiKey: string): Promise<SerpResult[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", "3");
  url.searchParams.set("api_key", apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const data = (await res.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.organic_results ?? []).slice(0, 3).map((r) => ({
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
  }));
}

/**
 * Build the "Web context" Markdown section for up to `limit` action
 * items, or return null when enrichment is unavailable.
 */
export async function enrichActions(
  actions: string[],
  limit = 3,
): Promise<string | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.log("🌐 --enrich given but SERPAPI_API_KEY is not set; skipping web context.");
    return null;
  }
  const top = actions.slice(0, limit);
  if (!top.length) return null;
  const lines: string[] = [`## 🌐 Web context`, ``];
  for (const item of top) {
    lines.push(`**For:** ${item}`, ``);
    try {
      const results = await searchSerpApi(item, apiKey);
      if (!results.length) {
        lines.push(`- (no web results found)`, ``);
        continue;
      }
      for (const r of results) {
        lines.push(`- [${r.title}](${r.link})${r.snippet ? ` — ${r.snippet}` : ""}`);
      }
      lines.push(``);
    } catch (err) {
      lines.push(`- (lookup failed: ${err instanceof Error ? err.message : String(err)})`, ``);
    }
  }
  console.log(`🌐 Web context added for ${top.length} action item(s) via SerpApi.`);
  return lines.join("\n");
}
