import katex from "katex";
import { warning } from "./warnings.ts";
import type { Root, RootContent } from "mdast";
import type { InlineMath, Math as MathBlock } from "mdast-util-math";
import type { MathTable, WarningSink } from "../../types/pipeline.ts";

const MATH_ELEMENT_PATTERN = /<math[^>]*>[\s\S]*?<\/math>/;

export const latexToMathml = (source: string, displayMode: boolean): string | null => {
  try {
    const rendered = katex.renderToString(source, {
      output: "mathml",
      displayMode,
      throwOnError: true,
      strict: "ignore",
    });
    const matched = MATH_ELEMENT_PATTERN.exec(rendered);
    return matched === null ? null : matched[0];
  } catch {
    return null;
  }
};

const collectMathNodes = (
  nodes: readonly RootContent[],
  collected: (MathBlock | InlineMath)[],
): void => {
  for (const node of nodes) {
    if (node.type === "math" || node.type === "inlineMath") {
      collected.push(node);
      continue;
    }
    if ("children" in node && Array.isArray(node.children)) {
      collectMathNodes(node.children, collected);
    }
  }
};

export const convertMath = (tree: Root, sink: WarningSink): MathTable => {
  const nodes: (MathBlock | InlineMath)[] = [];
  collectMathNodes(tree.children, nodes);

  const table = new Map<object, string | null>();
  for (const node of nodes) {
    const mathml = latexToMathml(node.value, node.type === "math");
    if (mathml === null) {
      sink.add(
        warning("MATH_NOT_CONVERTED", "The mathematics could not be converted to MathML.", {
          source: node.value,
        }),
      );
    }
    table.set(node, mathml);
  }
  return table;
};
