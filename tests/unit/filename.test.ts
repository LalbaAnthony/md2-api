import { describe, expect, it } from "vitest";
import { contentDispositionOf, sanitiseFileName } from "../../src/lib/filename.ts";

const codePoint = (...points: readonly number[]): string => String.fromCodePoint(...points);

describe("sanitising a file name", () => {
  it("falls back to a default name", () => {
    expect(sanitiseFileName(undefined, "docx")).toBe("document.docx");
    expect(sanitiseFileName("", "docx")).toBe("document.docx");
    expect(sanitiseFileName("   ", "docx")).toBe("document.docx");
  });

  it("forces the extension of the chosen backend", () => {
    expect(sanitiseFileName("report", "docx")).toBe("report.docx");
    expect(sanitiseFileName("report.pdf", "docx")).toBe("report.docx");
    expect(sanitiseFileName("report.docx", "json")).toBe("report.json");
  });

  it("keeps a dot inside the name", () => {
    expect(sanitiseFileName("report.v2.final", "docx")).toBe("report.v2.docx");
  });

  it("replaces path separators and collapses the repeats", () => {
    expect(sanitiseFileName("../../etc/passwd", "docx")).toBe("..-..-etc-passwd.docx");
    const windowsPath = ["C:", "Windows", "system32"].join(String.fromCharCode(92));
    expect(sanitiseFileName(windowsPath, "docx")).toBe("C-Windows-system32.docx");
  });

  it("removes control characters", () => {
    expect(sanitiseFileName(`re${codePoint(0x00)}po${codePoint(0x1f)}rt`, "docx")).toBe(
      "report.docx",
    );
    expect(sanitiseFileName(`report${codePoint(0x7f)}`, "docx")).toBe("report.docx");
  });

  it("removes characters that break a header", () => {
    expect(sanitiseFileName('re"po<rt>|?*', "docx")).toBe("report.docx");
  });

  it("normalises to composed unicode", () => {
    const decomposed = `cafe${codePoint(0x0301)}`;
    expect(sanitiseFileName(decomposed, "docx")).toBe(`caf${codePoint(0x00e9)}.docx`);
  });

  it("truncates to the byte budget", () => {
    const name = sanitiseFileName("x".repeat(400), "docx");
    expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(200);
    expect(name.endsWith(".docx")).toBe(true);
  });

  it("truncates on bytes, not characters", () => {
    const wide = codePoint(0x4e16).repeat(200);
    const name = sanitiseFileName(wide, "docx");
    expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(200);
  });
});

describe("the content disposition header", () => {
  it("carries both the plain and the encoded name", () => {
    expect(contentDispositionOf("report.docx")).toBe(
      "attachment; filename=\"report.docx\"; filename*=UTF-8''report.docx",
    );
  });

  it("encodes a non ascii name in both fields", () => {
    const name = `rapport-${codePoint(0x00e9)}.docx`;
    const header = contentDispositionOf(name);
    expect(header).toContain("filename*=UTF-8''rapport-%C3%A9.docx");
    expect(header).not.toContain(codePoint(0x00e9));
  });

  it("never emits a quote that would break the header", () => {
    const header = contentDispositionOf('a"b.docx');
    expect(header.split('"').length - 1).toBe(2);
  });
});
