import type { FootnoteDefinition, FootnoteReference, Root, RootContent } from "mdast";
import type { FootnoteTable, WarningSink } from "../../types/pipeline.ts";
import { warning } from "./warnings.ts";

const collect = (
  nodes: readonly RootContent[],
  definitions: FootnoteDefinition[],
  references: FootnoteReference[],
): void => {
  for (const node of nodes) {
    if (node.type === "footnoteDefinition") {
      definitions.push(node);
      continue;
    }
    if (node.type === "footnoteReference") {
      references.push(node);
    }
    if ("children" in node && Array.isArray(node.children)) {
      collect(node.children, definitions, references);
    }
  }
};

const removeDefinitions = (nodes: RootContent[]): void => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node === undefined) {
      continue;
    }
    if (node.type === "footnoteDefinition") {
      nodes.splice(index, 1);
      continue;
    }
    if ("children" in node && Array.isArray(node.children)) {
      removeDefinitions(node.children);
    }
  }
};

export const buildFootnoteTable = (tree: Root, sink: WarningSink): FootnoteTable => {
  const definitions: FootnoteDefinition[] = [];
  const references: FootnoteReference[] = [];
  collect(tree.children, definitions, references);

  const byIdentifier = new Map<string, FootnoteDefinition>();
  for (const definition of definitions) {
    byIdentifier.set(definition.identifier.toLowerCase(), definition);
  }

  const numberByIdentifier = new Map<string, number>();
  const ordered: { readonly id: number; readonly definition: FootnoteDefinition }[] = [];

  for (const reference of references) {
    const identifier = reference.identifier.toLowerCase();
    if (numberByIdentifier.has(identifier)) {
      continue;
    }
    const definition = byIdentifier.get(identifier);
    if (definition === undefined) {
      continue;
    }
    const id = numberByIdentifier.size + 1;
    numberByIdentifier.set(identifier, id);
    ordered.push({ id, definition });
  }

  for (const definition of definitions) {
    if (!numberByIdentifier.has(definition.identifier.toLowerCase())) {
      sink.add(
        warning("FOOTNOTE_UNUSED", "A footnote definition is never referenced.", {
          identifier: definition.identifier,
        }),
      );
    }
  }

  removeDefinitions(tree.children);

  return { numberByIdentifier, ordered };
};
