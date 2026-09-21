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
