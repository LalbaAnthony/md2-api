import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import process from "node:process";
import { describeFinding, findForbiddenCharacters } from "./forbidden-characters.mjs";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".avif",
  ".tiff",
  ".ico",
  ".pdf",
  ".docx",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".node",
  ".wasm",
]);

const SELF_EXEMPT_FILES = new Set([
  "tools/forbidden-characters.mjs",
  "tools/check-repository-charset.mjs",
]);

const MAX_INSPECTED_BYTES = 4_000_000;

const listTrackedFiles = () => {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.split("\0").filter((entry) => entry.length > 0);
  } catch {
    return null;
  }
};

const isInspectable = (path) => {
  if (SELF_EXEMPT_FILES.has(path)) {
    return false;
  }
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) {
    return false;
  }
  try {
    return statSync(path).size <= MAX_INSPECTED_BYTES;
  } catch {
    return false;
  }
};

const containsNullByte = (buffer) => buffer.includes(0);

const inspectFile = (path) => {
  const buffer = readFileSync(path);
  if (containsNullByte(buffer)) {
    return [];
  }
  return findForbiddenCharacters(buffer.toString("utf8")).map((finding) => ({ ...finding, path }));
};

const inspectCommitMessage = (path) => {
  const text = readFileSync(path, "utf8");
  const meaningful = text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("#"))
    .join("\n");
  return findForbiddenCharacters(meaningful).map((finding) => ({ ...finding, path }));
};

const reportAndExit = (findings) => {
  if (findings.length === 0) {
    process.stdout.write("Repository charset check passed.\n");
    return;
  }
  for (const finding of findings) {
    process.stderr.write(
      `${finding.path}:${finding.line}:${finding.column} ${describeFinding(finding)}\n`,
    );
  }
  process.stderr.write(`Repository charset check failed with ${findings.length} finding(s).\n`);
  process.exit(1);
};

const main = () => {
  const [, , mode, target] = process.argv;

  if (mode === "--commit-message") {
    if (target === undefined) {
      process.stderr.write("Usage: check-repository-charset.mjs --commit-message <path>\n");
      process.exit(2);
    }
    reportAndExit(inspectCommitMessage(target));
    return;
  }

  const tracked = listTrackedFiles();
  if (tracked === null) {
    console.log("Repository charset check skipped, no Git checkout to list tracked files from.");
    return;
  }
  const findings = tracked.filter(isInspectable).flatMap((path) => inspectFile(path));
  reportAndExit(findings);
};

main();
