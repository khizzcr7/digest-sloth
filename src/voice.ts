/**
 * Optional ElevenLabs narration (ElevenLabs partner integration).
 *
 * With `--voice` on the CLI and ELEVENLABS_API_KEY set, the digest's
 * per-file TL;DRs are narrated to out/digest.mp3 via the ElevenLabs
 * text-to-speech API. Perfect for the sloth lifestyle: don't even read
 * your digest — have it read to you.
 *
 * Without the key (or without the flag) this is a no-op. Voice can be
 * chosen with ELEVENLABS_VOICE_ID (default: "Rachel").
 */
import fs from "node:fs";
import path from "node:path";

import type { FileState } from "./state.ts";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel", a standard ElevenLabs voice

export function voiceEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function narrateDigest(files: FileState[]): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log("🔇 --voice given but ELEVENLABS_API_KEY is not set; skipping narration.");
    return null;
  }
  const parts: string[] = ["Here is your digest, courtesy of Digest Sloth."];
  for (const f of files) {
    if (f.finalSummary) parts.push(`${f.name}. ${f.finalSummary}`);
    if (f.actions?.length) {
      parts.push(`Action items: ${f.actions.join(". ")}.`);
    }
  }
  const text = parts.join("\n");
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    console.log(`🔇 ElevenLabs narration failed (HTTP ${res.status}); digest itself is unaffected.`);
    return null;
  }
  const outPath = path.resolve(process.cwd(), "out", "digest.mp3");
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`🔊 Narration written to out/digest.mp3 (${text.length} characters of TL;DR, read aloud).`);
  return outPath;
}
