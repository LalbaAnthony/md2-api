import { Document, PageOrientation, Paragraph } from "docx";
import { createRenderContext } from "./context.ts";
import { renderBlock } from "./block.ts";
import { buildFooter, buildHeader, buildTableOfContentsHeading, buildTitlePage } from "./chrome.ts";
import type { IPropertiesOptions, ISectionOptions, ISectionPropertiesOptions } from "docx";
import type { DocumentIr, SectionOverride } from "../../../types/ir.ts";
import type { DocxCompiledTheme } from "../../../types/docx-theme.ts";
import type {
  DocxBlockElement,
  DocxRenderContext,
  DocxRenderOutput,
} from "../../../types/docx-render.ts";
import type { DocumentOptions } from "../../../types/pipeline.ts";

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
  const isLandscape = orientation === "landscape";
  const longer = Math.max(Number(size.width ?? 0), Number(size.height ?? 0));
  const shorter = Math.min(Number(size.width ?? 0), Number(size.height ?? 0));
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

const footnotesOf = (
  document: DocumentIr,
  context: DocxRenderContext,
): Readonly<Record<string, { readonly children: readonly Paragraph[] }>> => {
  const entries: [string, { readonly children: readonly Paragraph[] }][] = [];
  for (const [id, blocks] of document.footnotes) {
    const paragraphs = blocks
      .flatMap((block) => renderBlock(block, context))
      .filter((element): element is Paragraph => element instanceof Paragraph);
    entries.push([
      String(id),
      {
        children:
          paragraphs.length === 0
            ? [new Paragraph({ style: context.compiled.styleIds.FootnoteText, children: [] })]
            : paragraphs,
      },
    ]);
  }
  return Object.fromEntries(entries);
};

const documentProperties = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  sections: readonly ISectionOptions[],
  footnotes: Readonly<Record<string, { readonly children: readonly Paragraph[] }>>,
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
  ...(Object.keys(footnotes).length === 0 ? {} : { footnotes }),
  sections: [...sections],
});

export const titlePageIsEnabled = (
  compiled: DocxCompiledTheme,
  options: DocumentOptions,
): boolean => options.titlePage ?? compiled.chrome.titlePage?.enabled ?? false;

export const renderDocument = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  strict: boolean,
  options: DocumentOptions = {},
): DocxRenderOutput & { readonly document: Document } => {
  const context = createRenderContext(compiled, document, strict);
  const header = buildHeader(compiled, document.meta);
  const footer = buildFooter(compiled, document.meta);

  const chrome = {
    ...(header === null ? {} : { headers: { default: header } }),
    ...(footer === null ? {} : { footers: { default: footer } }),
  };

  const sections: ISectionOptions[] = [];
  const allElements: DocxBlockElement[] = [];

  const titlePage = titlePageIsEnabled(compiled, options)
    ? buildTitlePage(compiled, document.meta)
    : [];
  const ownTitleSection =
    titlePage.length > 0 && compiled.chrome.titlePage?.pageBreakAfter === true;

  if (titlePage.length > 0) {
    allElements.push(...titlePage);
  }
  if (ownTitleSection) {
    sections.push({ properties: compiled.section, children: [...titlePage] });
  }

  let current: DocxBlockElement[] = ownTitleSection ? [] : [...titlePage];
  let properties: ISectionPropertiesOptions =
    titlePage.length > 0 && !ownTitleSection
      ? { ...compiled.section, titlePage: true }
      : compiled.section;

  const closeSection = (): void => {
    sections.push({ properties, ...chrome, children: [...current] });
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
    if (block.kind === "tableOfContents" && compiled.tableOfContents.title.length > 0) {
      const heading = buildTableOfContentsHeading(compiled);
      current.push(heading);
      allElements.push(heading);
    }
    const rendered = renderBlock(block, context);
    current.push(...rendered);
    allElements.push(...rendered);
  }

  closeSection();

  return {
    elements: allElements,
    warnings: context.warnings.list(),
    document: new Document(
      documentProperties(compiled, document, sections, footnotesOf(document, context)),
    ),
  };
};
