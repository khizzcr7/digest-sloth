/**
 * TabPFN priority scoring wrapper (see scripts/tabpfn_priority.py).
 *
 * With `--priority` on the CLI, after the digest is written this runs
 * the Python TabPFN prototype and returns its Markdown section for
 * appending to the digest. Any blocker (no token, package missing, no
 * action items) is logged once and yields null — the digest is never
 * held hostage by an optional scorer.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export async function tabpfnSection(): Promise<string | null> {
  const root = process.cwd();
  const script = path.join(root, "scripts", "tabpfn_priority.py");
  if (!fs.existsSync(script)) return null;
  const venvPython = path.join(root, ".venv-tabpfn", "bin", "python");
  const python = fs.existsSync(venvPython) ? venvPython : "python3";

  // The HTTP client inside tabpfn-client misparses this machine's IPv6
  // no_proxy entry and crashes on import; dropping it keeps the proxy
  // itself (http_proxy/https_proxy stay) and fixes the import.
  const env = { ...process.env };
  delete env.no_proxy;
  delete env.NO_PROXY;

  return new Promise((resolve) => {
    const child = spawn(python, [script], { cwd: root, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      const out = stdout.trim();
      if (code === 0 && out.startsWith("##")) {
        console.log("🎯 TabPFN priority section added (details in out/priorities.json).");
        resolve(out);
        return;
      }
      // The script reports blockers as a JSON line; surface the reason.
      const line = out.split("\n").find((l) => l.startsWith("{"));
      if (line) {
        try {
          const parsed = JSON.parse(line) as { status?: string; reason?: string };
          if (parsed.reason) console.log(`🎯 TabPFN skipped: ${parsed.reason}`);
        } catch {
          /* not JSON — ignore */
        }
      } else if (stderr.trim()) {
        console.log(`🎯 TabPFN skipped: ${stderr.trim().split("\n")[0]}`);
      }
      resolve(null);
    });
  });
}
