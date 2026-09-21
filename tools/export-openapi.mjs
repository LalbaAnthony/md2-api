import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const OUTPUT_PATH = resolve("docs/openapi.json");

const loadServer = async () => {
  const distEntry = resolve("dist/server.js");
  try {
    return await import(pathToFileURL(distEntry).href);
  } catch {
    process.stderr.write("Build the project first: npm run build\n");
    process.exit(2);
  }
};

const loadConfigModule = async () => import(pathToFileURL(resolve("dist/config.js")).href);

const buildDocument = async () => {
  const { buildServer } = await loadServer();
  const { loadConfig } = await loadConfigModule();
  const config = loadConfig({
    NODE_ENV: "development",
    LOG_LEVEL: "fatal",
    ENABLE_SWAGGER_UI: "false",
    ENABLE_THEME_WATCH: "false",
  });
  const app = await buildServer(config);
  await app.ready();
  const document = app.swagger();
  await app.close();
  return document;
};

const serialise = (document) => `${JSON.stringify(document, null, 2)}\n`;

const main = async () => {
  const document = await buildDocument();
  const serialised = serialise(document);

  if (process.argv.includes("--check")) {
    let committed = "";
    try {
      committed = await readFile(OUTPUT_PATH, "utf8");
    } catch {
      process.stderr.write(`${OUTPUT_PATH} is missing, run: npm run openapi:export\n`);
      process.exit(1);
    }
    if (committed !== serialised) {
      process.stderr.write(
        `${OUTPUT_PATH} differs from the generated document, run: npm run openapi:export\n`,
      );
      process.exit(1);
    }
    process.stdout.write("The committed OpenAPI document matches the served one.\n");
    return;
  }

  await writeFile(OUTPUT_PATH, serialised, "utf8");
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
};

await main();
