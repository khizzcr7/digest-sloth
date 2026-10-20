/**
 * Split text into small, model-friendly chunks at sentence boundaries.
 * Small chunks are the whole point: a small local model on a modest laptop
 * can chew through them one at a time, slowly and steadily.
 */
export function chunkText(text: string, maxWords = 130): string[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const sentences =
    clean.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+$/g)?.map((s) => s.trim()).filter(Boolean) ??
    [clean];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
  };

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) {
      // A single monster sentence: hard-split it by words.
      flush();
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(" "));
      }
      continue;
    }
    if (currentWords + words.length > maxWords) flush();
    current.push(sentence);
    currentWords += words.length;
  }
  flush();
  return chunks.filter((c) => c.trim().length > 0);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
