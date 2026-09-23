import { loadConfig } from "../dist/config.js";
import { buildServer } from "../dist/server.js";

const argumentValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? fallback : Number(found.slice(prefix.length));
};

const ITERATIONS = argumentValue("iterations", 10000);
const PARAGRAPHS = argumentValue("paragraphs", 40);
const WARMUP = argumentValue("warmup", 200);
const MAX_GROWTH_PERCENT = argumentValue("max-growth-percent", 10);
const MIB = 1024 * 1024;

const documentOf = (paragraphs) => {
  const lines = ["# A soak document", ""];
  for (let index = 0; index < paragraphs; index += 1) {
    lines.push(`## Section ${index + 1}`, "");
    lines.push(
      `A paragraph with **bold**, _italic_ and \`code\` in section ${index + 1}, long enough to`,
      "exercise the inline walker over several runs and a few line breaks.",
      "",
      "- A list item",
      "- Another list item",
      "",
    );
  }
  lines.push("| Column A | Column B |", "| --- | --- |", "| one | two |", "");
  return lines.join("\n");
};

const percentile = (sorted, fraction) => {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
};

const collectGarbage = () => {
  if (typeof global.gc === "function") {
    global.gc();
  }
};

const run = async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "fatal",
    MAX_CONCURRENT_CONVERSIONS: "4",
    CONVERT_QUEUE_LIMIT: "64",
  });
  const app = await buildServer(config);
  await app.ready();

  const markdown = documentOf(PARAGRAPHS);
  const payload = { markdown };
  const durations = [];
  let peakRss = 0;
  let failures = 0;

  for (let index = 0; index < WARMUP; index += 1) {
    await app.inject({ method: "POST", url: "/v1/convert", payload });
  }
  collectGarbage();
  const rssStart = process.memoryUsage().rss;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now();
    const response = await app.inject({ method: "POST", url: "/v1/convert", payload });
    durations.push(performance.now() - started);
    if (response.statusCode !== 200) {
      failures += 1;
    }
    if (index % 250 === 0) {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
  }

  collectGarbage();
  const rssEnd = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rssEnd);
  await app.close();

  const sorted = [...durations].sort((left, right) => left - right);
  const growthPercent = ((rssEnd - rssStart) / rssStart) * 100;
  const summary = {
    iterations: ITERATIONS,
    markdownBytes: Buffer.byteLength(markdown),
    failures,
    rssStartMib: Number((rssStart / MIB).toFixed(1)),
    rssEndMib: Number((rssEnd / MIB).toFixed(1)),
    rssPeakMib: Number((peakRss / MIB).toFixed(1)),
    rssGrowthPercent: Number(growthPercent.toFixed(2)),
    gcForced: typeof global.gc === "function",
    p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    p99Ms: Number(percentile(sorted, 0.99).toFixed(2)),
  };
  const stable = failures === 0 && growthPercent <= MAX_GROWTH_PERCENT;
  process.stdout.write(`${JSON.stringify({ ...summary, stable }, null, 2)}\n`);
  process.exitCode = stable ? 0 : 1;
};

run().catch((reason) => {
  process.stderr.write(`${reason instanceof Error ? reason.stack : String(reason)}\n`);
  process.exit(1);
});
