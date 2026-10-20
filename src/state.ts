/**
 * Checkpoint state. This is the "steady" half of Slow and Steady:
 * after every single chunk is summarized, progress is written to disk
 * (atomically, via tmp file + rename). If the laptop sleeps, the battery
 * dies, or the process is killed, re-running resumes exactly where it
 * stopped. Finished chunks are never redone.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ChunkState {
  text: string;
  summary: string | null;
}

export interface FileState {
  name: string;
  hash: string;
  chunks: ChunkState[];
  finalSummary: string | null;
  actions: string[] | null;
  done: boolean;
}

export interface ProgressState {
  files: Record<string, FileState>;
}

const STATE_PATH = path.resolve(process.cwd(), ".state", "progress.json");

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function loadState(): ProgressState {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as ProgressState;
  } catch {
    return { files: {} };
  }
}

export function saveState(state: ProgressState): void {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const tmp = STATE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}
