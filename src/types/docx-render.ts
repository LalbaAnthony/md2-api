import type { Footer, Header, Paragraph, Table } from "docx";
import type { ConversionWarning } from "./format.ts";
import type { DocumentIr } from "./ir.ts";
import type { DocxCompiledTheme } from "./docx-theme.ts";

export type DocxBlockElement = Paragraph | Table;

export interface DocxWarningCollector {
  add(warning: ConversionWarning): void;
  list(): readonly ConversionWarning[];
}

export interface DocxRenderContext {
  readonly compiled: DocxCompiledTheme;
  readonly document: DocumentIr;
  readonly strict: boolean;
  readonly warnings: DocxWarningCollector;
}

export interface DocxHeaderSet {
  readonly default: Header;
  readonly first?: Header;
  readonly even?: Header;
}

export interface DocxFooterSet {
  readonly default: Footer;
  readonly first?: Footer;
  readonly even?: Footer;
}

export interface DocxChromeParts {
  readonly headers: DocxHeaderSet | null;
  readonly footers: DocxFooterSet | null;
  readonly differentFirstPage: boolean;
  readonly differentOddEven: boolean;
}

export interface DocxRenderOutput {
  readonly elements: readonly DocxBlockElement[];
  readonly warnings: readonly ConversionWarning[];
}
