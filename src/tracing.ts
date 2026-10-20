/**
 * Optional Sentry tracing (Sentry partner integration).
 *
 * Enabled only when SENTRY_DSN is set. When it is, a digest run produces
 * one `digest.run` transaction with a child span for every model call
 * (`model.chat`, labelled by kind: chunk / file / actions), so you can see
 * exactly where the sloth spends its time in Sentry's trace view.
 *
 * When SENTRY_DSN is not set this module is a strict no-op: the wrappers
 * just call through, nothing is initialised, nothing is sent anywhere.
 */
import * as Sentry from "@sentry/node";

const ENABLED = Boolean(process.env.SENTRY_DSN);
let initialised = false;

export function initTracing(): void {
  if (!ENABLED || initialised) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    // A CLI run is short-lived; don't let telemetry batching hold the
    // process open. flushTracing() below awaits delivery explicitly.
    shutdownTimeout: 2,
  });
  initialised = true;
  console.log("📈 Sentry tracing on (SENTRY_DSN set) — this run will produce a trace.");
}

export function tracingEnabled(): boolean {
  return ENABLED;
}

/** Wrap the whole digest run in one transaction/span. */
export async function traceDigestRun<T>(fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  return Sentry.startSpan(
    { name: "digest.run", op: "digest.run" },
    async () => fn(),
  );
}

/** Wrap one model call in a child span, labelled by what it is doing. */
export async function traceModelCall<T>(
  kind: "chunk" | "file" | "actions",
  fn: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return fn();
  return Sentry.startSpan(
    {
      name: `model.chat.${kind}`,
      op: "model.chat",
      attributes: { "digest.kind": kind },
    },
    async () => fn(),
  );
}

/** Make sure queued spans actually leave before the process exits. */
export async function flushTracing(): Promise<void> {
  if (!ENABLED || !initialised) return;
  await Sentry.flush(2000);
}
