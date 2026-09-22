import { ExternalHyperlink, FootnoteReferenceRun, InternalHyperlink, TextRun } from "docx";
import { assertNever } from "../../../errors.ts";
import { mathFallbackWarning } from "./context.ts";
import { imageRunOf } from "./image.ts";
import type { ParagraphChild } from "docx";
import type { InlineMarks, IrInline } from "../../../types/ir.ts";
import type { DocxRenderContext } from "../../../types/docx-render.ts";

const LINE_BREAK_RUN = new TextRun({ break: 1 });

const runOptionsFor = (marks: InlineMarks) => ({
  bold: marks.bold,
  italics: marks.italic,
  strike: marks.strike,
  subScript: marks.subscript,
  superScript: marks.superscript,
});

export const renderInline = (
  nodes: readonly IrInline[],
  context: DocxRenderContext,
): readonly ParagraphChild[] => {
  const children: ParagraphChild[] = [];

  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        children.push(new TextRun({ text: node.value, ...runOptionsFor(node.marks) }));
        break;
      case "inlineCode":
        children.push(
          new TextRun({
            text: node.value,
            style: context.compiled.styleIds.CodeChar,
            ...runOptionsFor(node.marks),
          }),
        );
        break;
      case "lineBreak":
        children.push(node.hard ? new TextRun({ break: 1 }) : LINE_BREAK_RUN);
        break;
      case "link": {
        const inner = renderInline(node.children, context);
        if (node.internal) {
          children.push(
            new InternalHyperlink({ anchor: node.url.replace("#", ""), children: [...inner] }),
          );
          break;
        }
        children.push(new ExternalHyperlink({ link: node.url, children: [...inner] }));
        break;
      }
      case "image":
        children.push(imageRunOf(node.asset));
        break;
      case "footnoteReference":
        children.push(new FootnoteReferenceRun(node.id));
        break;
      case "mathInline":
        context.warnings.add(mathFallbackWarning(node.kind));
        children.push(
          new TextRun({ text: node.source, style: context.compiled.styleIds.MathInline }),
        );
        break;
      default:
        return assertNever(node, "renderInline");
    }
  }

  return children;
};
