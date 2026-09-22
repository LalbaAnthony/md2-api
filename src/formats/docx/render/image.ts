import { ImageRun, Paragraph } from "docx";
import { captionParagraph } from "./table.ts";
import type { IrImageAsset } from "../../../types/ir.ts";
import type { IrBlock } from "../../../types/ir.ts";
import type { DocxBlockElement, DocxRenderContext } from "../../../types/docx-render.ts";

const FIGURE_SEQUENCE_NAME = "Figure";

export const imageRunOf = (asset: IrImageAsset): ImageRun =>
  new ImageRun({
    type: asset.encoding === "jpeg" ? "jpg" : asset.encoding,
    data: Buffer.from(asset.data),
    transformation: { width: asset.rendered.width, height: asset.rendered.height },
    altText: { name: asset.sourceKey, title: asset.sourceKey, description: asset.sourceKey },
  });

export const renderFigure = (
  block: Extract<IrBlock, { kind: "figure" }>,
  context: DocxRenderContext,
): readonly DocxBlockElement[] => {
  const figure = new Paragraph({
    style: context.compiled.styleIds.Normal,
    alignment: context.compiled.figure.align === "center" ? "center" : "left",
    children: [imageRunOf(block.asset)],
  });

  if (block.caption === null) {
    return [figure];
  }

  const caption = captionParagraph(
    context,
    context.compiled.caption.figurePrefix,
    FIGURE_SEQUENCE_NAME,
    block.caption,
    context.compiled.styleIds.FigureCaption,
  );
  return context.compiled.caption.position === "above" ? [caption, figure] : [figure, caption];
};
