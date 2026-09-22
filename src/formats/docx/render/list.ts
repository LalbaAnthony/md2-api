import { Paragraph, TextRun } from "docx";
import { DOCX_MAX_LIST_DEPTH } from "../capabilities.ts";
import { unsupportedBlockWarning } from "./context.ts";
import { renderInline } from "./inline.ts";
import type { ParagraphChild } from "docx";
import type { IrBlock, ListFrame } from "../../../types/ir.ts";
import type { DocxBlockElement, DocxRenderContext } from "../../../types/docx-render.ts";

const NON_BREAKING_SPACE = String.fromCharCode(0xa0);
const LAST_LIST_LEVEL = DOCX_MAX_LIST_DEPTH - 1;

export const clampListLevel = (level: number): number => Math.min(level, LAST_LIST_LEVEL);

const indentForLevel = (context: DocxRenderContext, level: number): number =>
  context.compiled.list.indentStep * (level + 1);

const taskGlyphRun = (context: DocxRenderContext, checked: boolean): TextRun =>
  new TextRun({
    text: `${checked ? context.compiled.list.taskGlyphs.checked : context.compiled.list.taskGlyphs.unchecked}${NON_BREAKING_SPACE}`,
    font: context.compiled.fonts.mono,
  });

const listParagraph = (
  context: DocxRenderContext,
  frame: ListFrame,
  level: number,
  children: readonly ParagraphChild[],
  leading: boolean,
): Paragraph =>
  new Paragraph({
    style: context.compiled.styleIds.ListParagraph,
    contextualSpacing: !frame.spread,
    ...(leading
      ? {
          numbering: {
            reference: frame.ordered
              ? context.compiled.numberingReferences.ordered
              : context.compiled.numberingReferences.bullet,
            level,
            instance: frame.instance,
          },
        }
      : { indent: { left: indentForLevel(context, level) } }),
    children: [...children],
  });

const taskParagraph = (
  context: DocxRenderContext,
  frame: ListFrame,
  level: number,
  checked: boolean,
  children: readonly ParagraphChild[],
  leading: boolean,
): Paragraph =>
  new Paragraph({
    style: context.compiled.styleIds.TaskItem,
    contextualSpacing: !frame.spread,
    indent: { left: indentForLevel(context, level) },
    children: leading ? [taskGlyphRun(context, checked), ...children] : [...children],
  });

export const renderListItem = (
  block: Extract<IrBlock, { kind: "listItem" }>,
  context: DocxRenderContext,
  renderOther: (child: IrBlock, context: DocxRenderContext) => readonly DocxBlockElement[],
): readonly DocxBlockElement[] => {
  const level = clampListLevel(block.frame.level);
  if (block.frame.level > LAST_LIST_LEVEL) {
    context.warnings.add(
      unsupportedBlockWarning("listItem", {
        reason: "The list nesting exceeds the depth this format supports.",
        requestedLevel: block.frame.level,
        renderedLevel: level,
      }),
    );
  }

  const isTask = block.checked !== null;
  const checked = block.checked === true;
  const elements: DocxBlockElement[] = [];

  const pushParagraph = (children: readonly ParagraphChild[]): void => {
    const leading = elements.length === 0;
    elements.push(
      isTask
        ? taskParagraph(context, block.frame, level, checked, children, leading)
        : listParagraph(context, block.frame, level, children, leading),
    );
  };

  for (const child of block.blocks) {
    if (child.kind === "paragraph") {
      pushParagraph(renderInline(child.children, context));
      continue;
    }
    elements.push(...renderOther(child, context));
  }

  if (elements.length === 0) {
    pushParagraph([]);
  }

  return elements;
};
