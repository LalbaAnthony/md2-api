import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { listFiles, readSource, repositoryRoot } from "../helpers/source-tree.ts";

const sourceFiles = listFiles("src", [".ts"]);
const testFiles = listFiles("tests", [".ts"]);
const allTypeScriptFiles = [...sourceFiles, ...testFiles];

const LINE_COMMENT_PATTERN = /(^|[^:\w"'`\\])\/\/(?!\/)/;
const BLOCK_COMMENT_PATTERN = /\/\*/;
const TYPE_DECLARATION_PATTERN = /^\s*export\s+(?:type|interface)\s/m;
const ASSERTION_PATTERN = /\bas\s+(?:const\b|[A-Z_$][\w$]*|readonly\b|unknown\b|never\b)/;
const AWAIT_PATTERN = /\bawait\b/;
const IO_MODULE_PATTERN = /from\s+"(?:node:|undici|sharp|shiki)/;

const withoutStringLiterals = (source: string): string =>
  source
    .replaceAll(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replaceAll(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replaceAll(/`(?:[^`\\]|\\.)*`/g, "``")
    .replaceAll(/\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[dgimsuvy]*/g, "/re/");

describe("comment freedom", () => {
  it.each(allTypeScriptFiles)("%s contains no comment", (file) => {
    const stripped = withoutStringLiterals(readSource(file));
    expect(LINE_COMMENT_PATTERN.test(stripped), "line comment found").toBe(false);
    expect(BLOCK_COMMENT_PATTERN.test(stripped), "block comment found").toBe(false);
  });
});

describe("type placement", () => {
  const declaringFiles = sourceFiles.filter((file) =>
    TYPE_DECLARATION_PATTERN.test(readSource(file)),
  );

  it("declares types under src/types only", () => {
    const outside = declaringFiles.filter((file) => !file.startsWith("src/types/"));
    expect(outside).toEqual([]);
  });

  it("keeps src/types free of runtime values", () => {
    const offenders = sourceFiles
      .filter((file) => file.startsWith("src/types/"))
      .filter((file) => {
        const stripped = withoutStringLiterals(readSource(file));
        return /^\s*(?:export\s+)?(?:const|let|var|function|class)\s/m.test(stripped);
      });
    expect(offenders).toEqual([]);
  });

  it("uses no barrel file under src/types", () => {
    expect(sourceFiles).not.toContain("src/types/index.ts");
  });
});

describe("type assertion boundaries", () => {
  const SANCTIONED_FILES: ReadonlySet<string> = new Set([
    "src/units.ts",
    "src/theme/registry.ts",
    "src/config.ts",
    "src/formats/docx/theme-extension.ts",
  ]);

  it("keeps assertions inside the sanctioned files", () => {
    const offenders = sourceFiles
      .filter((file) => !SANCTIONED_FILES.has(file))
      .filter((file) => ASSERTION_PATTERN.test(withoutStringLiterals(readSource(file))));
    expect(offenders).toEqual([]);
  });

  it("forbids suppression comments everywhere", () => {
    const suppressionPattern = new RegExp(["@ts-", "(?:expect-error|ignore|nocheck)"].join(""));
    const offenders = allTypeScriptFiles.filter((file) =>
      suppressionPattern.test(readSource(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("forbids the any type everywhere", () => {
    const offenders = allTypeScriptFiles.filter((file) =>
      /:\s*any\b|<any>|\bas\s+any\b/.test(withoutStringLiterals(readSource(file))),
    );
    expect(offenders).toEqual([]);
  });
});

describe("format isolation", () => {
  it("imports the docx package under src/formats/docx only", () => {
    const offenders = sourceFiles
      .filter((file) => !file.startsWith("src/formats/docx/"))
      .filter((file) => /^(?!import type ).*from\s+"docx(?:\/[^"]*)?"/m.test(readSource(file)));
    expect(offenders).toEqual([]);
  });

  it("allows the docx type declarations to name docx types only", () => {
    const declarationFiles = sourceFiles.filter((file) => /^src\/types\/docx-/.test(file));
    expect(declarationFiles.length).toBeGreaterThan(0);
    for (const file of declarationFiles) {
      const source = readSource(file);
      const docxImports = [...source.matchAll(/^(.*)from\s+"docx"/gm)].map(
        (match) => match[1] ?? "",
      );
      for (const prefix of docxImports) {
        expect(prefix.trim().startsWith("import type"), `${file} imports docx as a value`).toBe(
          true,
        );
      }
    }
  });

  it("keeps renderers free of input and output", () => {
    const renderers = sourceFiles.filter((file) => /^src\/formats\/[^/]+\/render\//.test(file));
    const offenders = renderers.filter((file) => {
      const source = readSource(file);
      return AWAIT_PATTERN.test(withoutStringLiterals(source)) || IO_MODULE_PATTERN.test(source);
    });
    expect(offenders).toEqual([]);
  });
});

describe("repository charset", () => {
  it("passes the repository charset check on tracked files", () => {
    const run = (): string =>
      execFileSync("node", ["tools/check-repository-charset.mjs"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      });
    expect(run()).toContain("passed");
  });
});

describe("pipeline independence from formats", () => {
  const importsFormats = (file: string): boolean =>
    /from\s+"[^"]*\/formats\//.test(readSource(file));

  it("keeps the theme layer free of any format import", () => {
    const offenders = sourceFiles
      .filter((file) => file.startsWith("src/theme/"))
      .filter(importsFormats);
    expect(offenders).toEqual([]);
  });

  it("keeps the pipeline free of any format import", () => {
    const offenders = sourceFiles
      .filter((file) => file.startsWith("src/pipeline/"))
      .filter(importsFormats);
    expect(offenders).toEqual([]);
  });

  it("keeps the shared library free of any format import", () => {
    const offenders = sourceFiles
      .filter((file) => file.startsWith("src/lib/"))
      .filter(importsFormats);
    expect(offenders).toEqual([]);
  });

  it("wires the format layer from the composition root and the routes only", () => {
    const offenders = sourceFiles
      .filter((file) => !file.startsWith("src/formats/"))
      .filter((file) => file !== "src/server.ts" && !file.startsWith("src/routes/"))
      .filter(importsFormats);
    expect(offenders).toEqual([]);
  });

  it("declares the intermediate representation without naming any format", () => {
    const source = readSource("src/types/ir.ts").toLowerCase();
    for (const forbidden of ["docx", "ooxml", "omml", "openxml", "wordprocessing"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
