import { SHUTDOWN_GRACE_PERIOD_MS } from "./constants.ts";
import { loadConfig } from "./config.ts";
import { createReadinessState } from "./lib/readiness.ts";
import { buildServer } from "./server.ts";

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

const start = async (): Promise<void> => {
  const config = loadConfig();
  const readiness = createReadinessState();
  const app = await buildServer(config, { readiness });

  readiness.formatsWarmedUp = true;

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, "Shutting down.");
    const forceExit = setTimeout(() => {
      app.log.error("Grace period elapsed, forcing exit.");
      process.exit(1);
    }, SHUTDOWN_GRACE_PERIOD_MS);
    forceExit.unref();
    app
      .close()
      .then(() => {
        clearTimeout(forceExit);
        process.exit(0);
      })
      .catch((reason: unknown) => {
        app.log.error({ err: reason }, "Shutdown failed.");
        process.exit(1);
      });
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, shutdown);
  }

  await app.listen({ port: config.PORT, host: config.HOST });
};

start().catch((reason: unknown) => {
  process.stderr.write(`${reason instanceof Error ? reason.stack : String(reason)}\n`);
  process.exit(1);
});
