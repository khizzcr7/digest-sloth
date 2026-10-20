/**
 * URL input path (Browserbase / Stagehand partner integration).
 *
 * Drop a `.url` file into the inbox — a plain text file whose first line
 * is a web address — and Digest Sloth digests the page like any other
 * file. With BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID set, the
 * page is fetched with Stagehand on Browserbase's cloud browsers (real
 * browser, JavaScript rendered). Without them, it falls back to a plain
 * fetch + tag-strip so the feature still works, just less cleverly.
 */

/** Crude HTML -> text for the fallback path. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function fetchWithStagehand(url: string): Promise<string> {
  // Stagehand v4: launch a Browserbase cloud browser, then drive it.
  const { Stagehand, browserbase } = await import("@browserbasehq/stagehand");
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY as string,
    projectId: process.env.BROWSERBASE_PROJECT_ID as string,
  });
  const stagehand = await Stagehand.create({ browser });
  try {
    const context = stagehand.browser.context;
    const page = (await context.pages())[0] ?? (await context.newPage());
    await page.goto(url);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    return String(text).trim();
  } finally {
    await stagehand.close().catch(() => undefined);
  }
}

export async function fetchUrlText(url: string): Promise<string | null> {
  const hasBrowserbase = Boolean(
    process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID,
  );
  if (hasBrowserbase) {
    try {
      const text = await fetchWithStagehand(url);
      if (text) {
        console.log(`   🌍 Fetched ${url} via Stagehand/Browserbase (${text.length} chars of page text).`);
        return text;
      }
    } catch (err) {
      console.log(
        `   🌍 Stagehand fetch failed (${err instanceof Error ? err.message : String(err)}); falling back to plain fetch.`,
      );
    }
  }
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "DigestSloth/0.2 (+local digest tool)" },
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`   🌍 Plain fetch of ${url} returned HTTP ${res.status}.`);
      return null;
    }
    const html = await res.text();
    const text = htmlToText(html);
    console.log(
      `   🌍 Fetched ${url} via plain fetch (${text.length} chars). Set BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID for the Stagehand path.`,
    );
    return text || null;
  } catch (err) {
    console.log(`   🌍 Fetch of ${url} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
