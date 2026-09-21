import { Document } from "docx";
import { createRenderContext } from "./context.ts";
import { renderBlocks } from "./block.ts";
import type { IPropertiesOptions } from "docx";
import type { DocumentIr } from "../../../types/ir.ts";
import type { DocxCompiledTheme } from "../../../types/docx-theme.ts";
import type { DocxBlockElement, DocxRenderOutput } from "../../../types/docx-render.ts";

const documentProperties = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  children: readonly DocxBlockElement[],
): IPropertiesOptions => ({
  styles: compiled.styles,
  numbering: compiled.numbering,
  features: { updateFields: compiled.extension.updateFieldsOnOpen },
  compatabilityModeVersion: compiled.extension.compatibilityModeVersion,
  ...(document.meta.title === undefined ? {} : { title: document.meta.title }),
  ...(document.meta.subject === undefined ? {} : { subject: document.meta.subject }),
  ...(document.meta.authors.length === 0 ? {} : { creator: document.meta.authors.join(", ") }),
  ...(document.meta.keywords.length === 0 ? {} : { keywords: document.meta.keywords.join(", ") }),
  ...(document.meta.subtitle === undefined ? {} : { description: document.meta.subtitle }),
  sections: [{ properties: compiled.section, children: [...children] }],
});

export const renderDocument = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  strict: boolean,
): DocxRenderOutput & { readonly document: Document } => {
  const context = createRenderContext(compiled, document, strict);
  const elements = renderBlocks(document.blocks, context);
  return {
    elements,
    warnings: context.warnings.list(),
    document: new Document(documentProperties(compiled, document, elements)),
  };
};
