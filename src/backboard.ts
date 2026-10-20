/**
 * Optional Backboard model comparison (Backboard partner integration).
 *
 * `npm run compare` takes the first chunk of the first inbox file and
 * summarises it twice: once with the local open-weight model, and once
 * through Backboard's API (one API key, thousands of models, with
 * memory/RAG built in). Both summaries land side by side in
 * out/compare.md so you can see what the cloud buys you over the sloth.
 *
 * Requires BACKBOARD_API_KEY. Optional: BACKBOARD_LLM_PROVIDER and
 * BACKBOARD_MODEL_NAME choose the model (defaults are Backboard's own).
 */
const API_URL = "https://app.backboard.io/api/threads/messages";

export async function summarizeWithBackboard(text: string): Promise<string> {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) throw new Error("BACKBOARD_API_KEY is not set");
  const body: Record<string, unknown> = {
    content:
      "Summarize the following text in one or two sentences. Output only the summary, as plain prose.\n\n" +
      text,
  };
  if (process.env.BACKBOARD_LLM_PROVIDER) body.llm_provider = process.env.BACKBOARD_LLM_PROVIDER;
  if (process.env.BACKBOARD_MODEL_NAME) body.model_name = process.env.BACKBOARD_MODEL_NAME;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Backboard HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content?: string };
  return (data.content ?? "").trim();
}
