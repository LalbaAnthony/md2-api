const argumentValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
};

const BASE = argumentValue("url", "http://127.0.0.1:3000");
const RUNS = Number(argumentValue("runs", "40"));
const WARMUP = Number(argumentValue("warmup", "5"));

const PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVQoz2P8//8/Ay0BEwONGB01ZNSQUUNGDQEAO1kDCUwjnDkAAAAASUVORK5CYII=";

const paragraph = (index) =>
  [
    `A paragraph number ${index} with **bold**, _italic_ and \`code\`, long enough to exercise`,
    "the inline walker, the anchor pass and the run builder over a realistic line length.",
  ].join("\n");

const fillTo = (lines, targetBytes, blockOf) => {
  let index = 0;
  while (Buffer.byteLength(lines.join("\n")) < targetBytes) {
    lines.push(...blockOf(index), "");
    index += 1;
  }
  return lines.join("\n");
};

const plainDocument = (targetBytes) =>
  fillTo(["# A plain document", ""], targetBytes, (index) => [
    `## Section ${index + 1}`,
    "",
    paragraph(index + 1),
  ]);

const richDocument = (targetBytes) => {
  const lines = ["# A rich document", ""];
  for (let index = 0; index < 10; index += 1) {
    lines.push(
      "```ts",
      `const value${index} = { id: ${index}, label: "row ${index}" };`,
      `export const use${index} = (): number => value${index}.id;`,
      "```",
      "",
    );
  }
  for (let index = 0; index < 3; index += 1) {
    lines.push(
      "| Column A | Column B | Column C |",
      "| -------- | -------- | -------- |",
      "| one      | two      | three    |",
      "| four     | five     | six      |",
      "",
    );
  }
  return fillTo(lines, targetBytes, (index) => [
    `## Section ${index + 1}`,
    "",
    paragraph(index + 1),
  ]);
};

const imageDocument = (targetBytes, imageCount) => {
  const lines = ["# An illustrated document", ""];
  for (let index = 0; index < imageCount; index += 1) {
    lines.push(`![Figure ${index + 1}](${PIXEL_PNG})`, "");
  }
  return fillTo(lines, targetBytes, (index) => [
    `## Section ${index + 1}`,
    "",
    paragraph(index + 1),
  ]);
};

const percentile = (sorted, fraction) =>
  sorted.length === 0
    ? 0
    : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

const measure = async (label, markdown) => {
  const body = JSON.stringify({ markdown });
  const send = async () => {
    const started = performance.now();
    const response = await fetch(`${BASE}/v1/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const payload = await response.arrayBuffer();
    return { ms: performance.now() - started, status: response.status, bytes: payload.byteLength };
  };

  for (let index = 0; index < WARMUP; index += 1) {
    await send();
  }
  const durations = [];
  let failures = 0;
  let outputBytes = 0;
  for (let index = 0; index < RUNS; index += 1) {
    const outcome = await send();
    durations.push(outcome.ms);
    outputBytes = outcome.bytes;
    if (outcome.status !== 200) {
      failures += 1;
    }
  }
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    document: label,
    markdownKib: Number((Buffer.byteLength(markdown) / 1024).toFixed(1)),
    outputKib: Number((outputBytes / 1024).toFixed(1)),
    runs: RUNS,
    failures,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(1)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(1)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(1)),
  };
};

const run = async () => {
  const results = [
    await measure("5 KiB, no image and no code", plainDocument(5 * 1024)),
    await measure("50 KiB, 10 code blocks and 3 tables", richDocument(50 * 1024)),
    await measure("500 KiB, 20 images", imageDocument(500 * 1024, 20)),
  ];
  process.stdout.write(`${JSON.stringify({ url: BASE, results }, null, 2)}\n`);
  process.exitCode = results.every((entry) => entry.failures === 0) ? 0 : 1;
};

run().catch((reason) => {
  process.stderr.write(`${reason instanceof Error ? reason.stack : String(reason)}\n`);
  process.exit(1);
});
