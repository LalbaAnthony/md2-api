import { Document, PageOrientation } from "docx";
import { createRenderContext } from "./context.ts";
import { renderBlock } from "./block.ts";
import type { IPropertiesOptions, ISectionOptions, ISectionPropertiesOptions } from "docx";
import type { DocumentIr, SectionOverride } from "../../../types/ir.ts";
import type { DocxCompiledTheme } from "../../../types/docx-theme.ts";
import type { DocxBlockElement, DocxRenderOutput } from "../../../types/docx-render.ts";

const SINGLE_COLUMN = 1;
const COLUMN_SPACE = 708;

const swapPageSize = (
  section: ISectionPropertiesOptions,
  orientation: "portrait" | "landscape",
): ISectionPropertiesOptions => {
  const size = section.page?.size;
  if (size === undefined) {
    return section;
  }
  const width = size.width ?? 0;
  const height = size.height ?? 0;
  const isLandscape = orientation === "landscape";
  const longer = Math.max(Number(width), Number(height));
  const shorter = Math.min(Number(width), Number(height));
  return {
    ...section,
    page: {
      ...section.page,
      size: {
        ...size,
        width: isLandscape ? longer : shorter,
        height: isLandscape ? shorter : longer,
        orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
    },
  };
};

export const sectionPropertiesFor = (
  base: ISectionPropertiesOptions,
  override: SectionOverride,
): ISectionPropertiesOptions => {
  const oriented = override.orientation === null ? base : swapPageSize(base, override.orientation);
  const count = override.columnCount ?? SINGLE_COLUMN;
  return { ...oriented, column: { count, space: COLUMN_SPACE, separate: false } };
};

const documentProperties = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  sections: readonly ISectionOptions[],
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
  sections: [...sections],
});

export const renderDocument = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  strict: boolean,
): DocxRenderOutput & { readonly document: Document } => {
  const context = createRenderContext(compiled, document, strict);

  const sections: ISectionOptions[] = [];
  const allElements: DocxBlockElement[] = [];
  let current: DocxBlockElement[] = [];
  let properties: ISectionPropertiesOptions = compiled.section;

  const closeSection = (): void => {
    sections.push({ properties, children: [...current] });
    current = [];
  };

  for (const block of document.blocks) {
    if (block.kind === "sectionStart") {
      if (current.length > 0) {
        closeSection();
      }
      properties = sectionPropertiesFor(compiled.section, block.section);
      continue;
    }
    const rendered = renderBlock(block, context);
    current.push(...rendered);
    allElements.push(...rendered);
  }

  closeSection();

  return {
    elements: allElements,
    warnings: context.warnings.list(),
    document: new Document(documentProperties(compiled, document, sections)),
  };
};
