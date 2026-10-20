/**
 * Temporal worker for the digest pipeline. Run with:
 *   npm run temporal:worker
 * Needs a Temporal server: either a local dev server
 * (`temporal server start-dev`, from the Temporal CLI) or Temporal
 * Cloud. TEMPORAL_ADDRESS (default localhost:7233) and
 * TEMPORAL_NAMESPACE (default "default") configure the connection;
 * for Temporal Cloud also set TEMPORAL_API_KEY / TLS via the standard
 * SDK environment conventions of your namespace.
 */
import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";

import * as activities from "./activities.ts";
import { TASK_QUEUE } from "./common.ts";

async function run(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  try {
    const worker = await Worker.create({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
      taskQueue: TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
      activities,
    });
    console.log(`⏳ Temporal worker listening on task queue "${TASK_QUEUE}"`);
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error("💥 Temporal worker failed:", err);
  process.exit(1);
});
