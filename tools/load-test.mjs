import autocannon from "autocannon";

const argumentValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
};

const URL = argumentValue("url", "http://127.0.0.1:3000");
const DURATION = Number(argumentValue("duration", "30"));
const CONNECTIONS = Number(argumentValue("connections", "8"));
const TARGET_BYTES = Number(argumentValue("bytes", "51200"));

const documentOf = (targetBytes) => {
  const block = [
    "## A section",
    "",
    "A paragraph with **bold**, _italic_ and `code`, written to fill the document without",
    "depending on an image or on a highlighted code block.",
    "",
    "- A list item",
    "- Another list item",
    "",
    "| Column A | Column B |",
    "| -------- | -------- |",
    "| one      | two      |",
    "",
  ].join("\n");
  const lines = ["# A load test document", ""];
  let size = lines.join("\n").length;
  while (size < targetBytes) {
    lines.push(block);
    size += block.length;
  }
  return lines.join("\n");
};

const run = async () => {
  const markdown = documentOf(TARGET_BYTES);
  const result = await autocannon({
    url: `${URL}/convert`,
    method: "POST",
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown }),
  });

  const summary = {
    url: URL,
    markdownBytes: Buffer.byteLength(markdown),
    connections: CONNECTIONS,
    durationSeconds: DURATION,
    requests: result.requests.total,
    requestsPerSecond: result.requests.average,
    latencyP50Ms: result.latency.p50,
    latencyP95Ms: result.latency.p97_5,
    latencyP99Ms: result.latency.p99,
    latencyMaxMs: result.latency.max,
    statusCodes: Object.fromEntries(
      Object.entries(result.statusCodeStats ?? {}).map(([code, entry]) => [code, entry.count]),
    ),
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = result.errors === 0 && result.timeouts === 0 ? 0 : 1;
};

run().catch((reason) => {
  process.stderr.write(`${reason instanceof Error ? reason.stack : String(reason)}\n`);
  process.exit(1);
});
