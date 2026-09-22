import { z } from "zod";
import type { ContainerDirective, LeafDirective } from "mdast-util-directive";
import type { CalloutKind } from "../../types/ir.ts";
import type {
  CalloutDirective,
  ColumnsDirective,
  DirectiveIssue,
  DirectiveOutcome,
  FigureDirective,
} from "../../types/pipeline.ts";

export const FIGURE_DIRECTIVE_NAME = "figure";
export const CALLOUT_DIRECTIVE_NAME = "callout";
export const COLUMNS_DIRECTIVE_NAME = "columns";
export const LANDSCAPE_DIRECTIVE_NAME = "landscape";
export const PAGEBREAK_DIRECTIVE_NAME = "pagebreak";
export const TOC_DIRECTIVE_NAME = "toc";

export const KNOWN_LEAF_DIRECTIVES: ReadonlySet<string> = new Set([
  FIGURE_DIRECTIVE_NAME,
  PAGEBREAK_DIRECTIVE_NAME,
  TOC_DIRECTIVE_NAME,
]);

export const KNOWN_CONTAINER_DIRECTIVES: ReadonlySet<string> = new Set([
  CALLOUT_DIRECTIVE_NAME,
  COLUMNS_DIRECTIVE_NAME,
  LANDSCAPE_DIRECTIVE_NAME,
]);

const MINIMUM_COLUMNS = 2;
const MAXIMUM_COLUMNS = 4;

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

const calloutAttributesSchema = z.strictObject({
  type: z.enum(["info", "warning", "danger", "success", "note"]).optional(),
  title: z.string().optional(),
});

const columnsAttributesSchema = z.strictObject({
  count: z
    .string()
    .regex(/^[2-4]$/)
    .optional(),
});

const emptyAttributesSchema = z.strictObject({});

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

const attributesOf = (node: ContainerDirective | LeafDirective): Record<string, string> => {
  const source = node.attributes ?? {};
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      attributes[key] = value;
    }
  }
  return attributes;
};

const issuesOf = (error: z.ZodError): readonly DirectiveIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
  }));

export const isFigureDirective = (node: LeafDirective): boolean =>
  node.name === FIGURE_DIRECTIVE_NAME;

export const parseFigureDirective = (node: LeafDirective): DirectiveOutcome<FigureDirective> => {
  const parsed = figureAttributesSchema.safeParse(attributesOf(node));
  if (!parsed.success) {
    return { ok: false, issues: issuesOf(parsed.error) };
  }
  return {
    ok: true,
    value: {
      source: parsed.data.src,
      alternativeText: parsed.data.alt ?? "",
      caption: parsed.data.caption ?? null,
      widthRatio: parseWidthRatio(parsed.data.width),
    },
  };
};

export const parseCalloutDirective = (
  node: ContainerDirective,
): DirectiveOutcome<CalloutDirective> => {
  const parsed = calloutAttributesSchema.safeParse(attributesOf(node));
  if (!parsed.success) {
    return { ok: false, issues: issuesOf(parsed.error) };
  }
  const variant: CalloutKind = parsed.data.type ?? "note";
  return { ok: true, value: { variant, title: parsed.data.title ?? null } };
};

export const parseColumnsDirective = (
  node: ContainerDirective,
): DirectiveOutcome<ColumnsDirective> => {
  const parsed = columnsAttributesSchema.safeParse(attributesOf(node));
  if (!parsed.success) {
    return { ok: false, issues: issuesOf(parsed.error) };
  }
  const count = parsed.data.count === undefined ? MINIMUM_COLUMNS : Number(parsed.data.count);
  return {
    ok: true,
    value: { count: Math.min(Math.max(count, MINIMUM_COLUMNS), MAXIMUM_COLUMNS) },
  };
};

export const parseBareDirective = (
  node: ContainerDirective | LeafDirective,
): DirectiveOutcome<true> => {
  const parsed = emptyAttributesSchema.safeParse(attributesOf(node));
  if (!parsed.success) {
    return { ok: false, issues: issuesOf(parsed.error) };
  }
  return { ok: true, value: true };
};
