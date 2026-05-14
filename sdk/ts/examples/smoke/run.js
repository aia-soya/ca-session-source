import { loadSmokeConfig } from "./lib/config.js";
import { runSmoke } from "./lib/runner.js";

runSmoke(loadSmokeConfig()).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
