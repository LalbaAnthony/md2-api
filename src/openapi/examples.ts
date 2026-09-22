export const MINIMAL_MARKDOWN_EXAMPLE = "# Quarterly report\n\nRevenue grew by four percent.\n";

export const FULL_MARKDOWN_EXAMPLE = [
  "---",
  "title: Quarterly report",
  "author:",
  "  - Ada Lovelace",
  "date: 2026-03-31",
  "---",
  "",
  "# Summary",
  "",
  "Revenue grew by **four percent** against a flat market.",
  "",
  "## Outlook",
  "",
  "See the [summary](#summary) for the headline figures.",
  "",
  "---",
  "",
  "Prepared by the finance team.",
  "",
].join("\n");

export const convertRequestExample = {
  markdown: MINIMAL_MARKDOWN_EXAMPLE,
  theme: "default",
  format: "docx",
  filename: "quarterly-report",
  metadata: {
    title: "Quarterly report",
    author: ["Ada Lovelace"],
    keywords: ["finance", "quarter"],
    language: "en",
  },
  options: { strict: false },
};

export const convertMinimalRequestExample = { markdown: MINIMAL_MARKDOWN_EXAMPLE };

export const errorResponseExample = {
  error: {
    code: "THEME_NOT_FOUND",
    message: "Unknown theme: ghost",
    details: { requested: "ghost", available: ["default"] },
    requestId: "6f1e9c0c-1a2b-4c3d-8e5f-7a9b0c1d2e3f",
  },
};

const optionMarkup = (
  entries: readonly { readonly id: string; readonly label: string }[],
): string =>
  entries
    .map((entry) => `<option value="${entry.id}">${entry.label} (${entry.id})</option>`)
    .join("");

export const previewPage = (
  themes: readonly { readonly id: string; readonly label: string }[],
  formats: readonly { readonly id: string; readonly label: string }[],
): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>md2 preview</title>
<style>
:root { color-scheme: light dark; --gap: 0.75rem; }
body { font-family: system-ui, sans-serif; margin: 0; height: 100vh; display: flex; flex-direction: column; }
header { display: flex; gap: var(--gap); align-items: center; padding: var(--gap); border-bottom: 1px solid #8884; flex-wrap: wrap; }
h1 { font-size: 1rem; margin: 0 var(--gap) 0 0; }
main { flex: 1; display: flex; min-height: 0; }
textarea { flex: 1; border: 0; padding: var(--gap); font-family: ui-monospace, monospace; font-size: 0.9rem; resize: none; }
aside { width: 22rem; border-left: 1px solid #8884; padding: var(--gap); overflow: auto; font-size: 0.85rem; }
button { padding: 0.4rem 0.9rem; }
label { display: inline-flex; gap: 0.3rem; align-items: center; }
pre { white-space: pre-wrap; word-break: break-word; }
.status { margin-left: auto; opacity: 0.7; }
</style>
</head>
<body>
<header>
<h1>md2 preview</h1>
<label>Theme <select id="theme">${optionMarkup(themes)}</select></label>
<label>Format <select id="format">${optionMarkup(formats)}</select></label>
<label><input type="checkbox" id="strict"> Strict</label>
<button id="convert">Convert</button>
<span class="status" id="status"></span>
</header>
<main>
<textarea id="markdown" spellcheck="false"># Preview

A paragraph with **bold** text and \`code\`.

- A list item
- Another item
</textarea>
<aside><h2>Result</h2><pre id="result">Nothing converted yet.</pre></aside>
</main>
<script type="module">
const el = (id) => document.getElementById(id);
const status = el("status");
const result = el("result");

el("convert").addEventListener("click", async () => {
  status.textContent = "Converting...";
  result.textContent = "";
  const body = {
    markdown: el("markdown").value,
    theme: el("theme").value,
    format: el("format").value,
    options: { strict: el("strict").checked },
  };
  try {
    const response = await fetch("/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const failure = await response.json();
      status.textContent = "Failed " + response.status;
      result.textContent = JSON.stringify(failure, null, 2);
      return;
    }
    const warnings = response.headers.get("x-conversion-warnings") ?? "0";
    const milliseconds = response.headers.get("x-convert-ms") ?? "0";
    status.textContent = "Converted in " + milliseconds + " ms, " + warnings + " warning(s)";
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const named = /filename="([^"]+)"/.exec(disposition);
    const name = named ? named[1] : "document";
    if ((response.headers.get("content-type") ?? "").includes("json")) {
      result.textContent = await blob.text();
    } else {
      result.textContent = "Downloaded " + name + " (" + blob.size + " bytes)";
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (reason) {
    status.textContent = "Failed";
    result.textContent = String(reason);
  }
});
</script>
</body>
</html>
`;
