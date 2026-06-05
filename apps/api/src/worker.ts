import { closePool } from "./db.js";
import { processNextJob } from "./ingestion.js";

const once = process.argv.includes("--once");

try {
  if (once) {
    await processNextJob();
  } else {
    for (;;) {
      const processed = await processNextJob();
      if (!processed) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
} finally {
  if (once) {
    await closePool();
  }
}
