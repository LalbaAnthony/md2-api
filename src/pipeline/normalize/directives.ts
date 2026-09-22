import { z } from "zod";
import { directiveError } from "../../errors.ts";
import type { LeafDirective } from "mdast-util-directive";
import type { FigureDirective } from "../../types/pipeline.ts";

export const FIGURE_DIRECTIVE_NAME = "figure";

const widthSchema = z
  .string()
  .regex(/^(?:\d{1,3}(?:\.\d+)?%|0?\.\d+|1(?:\.0+)?)$/)
  .optional();

const figureAttributesSchema = z.strictObject({
  src: z.string().min(1),
  alt: z.string().optional(),
  width: widthSchema,
  caption: z.string().optional(),
});

export const parseWidthRatio = (width: string | undefined): number => {
  if (width === undefined) {
    return 1;
  }
  const ratio = width.endsWith("%")
    ? Number.parseFloat(width.slice(0, -1)) / 100
    : Number.parseFloat(width);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }
  return Math.min(ratio, 1);
};

const attributesOf = (node: LeafDirective): Record<string, string> => {
  const source = node.attributes ?? {};
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      attributes[key] = value;
    }
  }
  return attributes;
};

export const isFigureDirective = (node: LeafDirective): boolean =>
  node.name === FIGURE_DIRECTIVE_NAME;

export const parseFigureDirective = (node: LeafDirective): FigureDirective => {
  const parsed = figureAttributesSchema.safeParse(attributesOf(node));
  if (!parsed.success) {
    throw directiveError("The figure directive carries invalid attributes.", {
      directive: FIGURE_DIRECTIVE_NAME,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map((segment) => String(segment)),
        message: issue.message,
      })),
    });
  }
  return {
    source: parsed.data.src,
    alternativeText: parsed.data.alt ?? "",
    caption: parsed.data.caption ?? null,
    widthRatio: parseWidthRatio(parsed.data.width),
  };
};
