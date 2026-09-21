import { toString as mdastToString } from "mdast-util-to-string";
import type {
  Definition,
  Image,
  ImageReference,
  Link,
  LinkReference,
  Parent,
  Root,
  RootContent,
} from "mdast";
import type { WarningSink } from "../../types/pipeline.ts";
import { warning } from "./warnings.ts";

const collectDefinitions = (nodes: readonly RootContent[], collected: Definition[]): void => {
  for (const node of nodes) {
    if (node.type === "definition") {
      collected.push(node);
      continue;
    }
    if ("children" in node && Array.isArray(node.children)) {
      collectDefinitions(node.children, collected);
    }
  }
};

const toLink = (reference: LinkReference, definition: Definition): Link => ({
  type: "link",
  url: definition.url,
  ...(definition.title === null || definition.title === undefined
    ? {}
    : { title: definition.title }),
  children: reference.children,
  ...(reference.position === undefined ? {} : { position: reference.position }),
});

const toImage = (reference: ImageReference, definition: Definition): Image => ({
  type: "image",
  url: definition.url,
  alt: reference.alt ?? mdastToString(reference),
  ...(definition.title === null || definition.title === undefined
    ? {}
    : { title: definition.title }),
  ...(reference.position === undefined ? {} : { position: reference.position }),
});

const literalFallback = (reference: LinkReference | ImageReference): RootContent => ({
  type: "text",
  value:
    reference.type === "linkReference"
      ? `[${mdastToString(reference)}]`
      : `![${reference.alt ?? ""}]`,
});

const isParent = (node: RootContent): node is RootContent & Parent =>
  "children" in node && Array.isArray(node.children);

export const resolveLinkReferences = (tree: Root, sink: WarningSink): void => {
  const definitions: Definition[] = [];
  collectDefinitions(tree.children, definitions);
  const byIdentifier = new Map<string, Definition>(
    definitions.map((definition) => [definition.identifier.toLowerCase(), definition]),
  );

  const rewrite = (parent: Parent): void => {
    const replaced: RootContent[] = [];
    for (const child of parent.children) {
      if (child.type === "definition") {
        continue;
      }
      if (child.type === "linkReference" || child.type === "imageReference") {
        const definition = byIdentifier.get(child.identifier.toLowerCase());
        if (definition === undefined) {
          sink.add(
            warning("LINK_DEFINITION_MISSING", "A link reference has no definition.", {
              identifier: child.identifier,
            }),
          );
          replaced.push(literalFallback(child));
          continue;
        }
        const resolved =
          child.type === "linkReference" ? toLink(child, definition) : toImage(child, definition);
        replaced.push(resolved);
        if (resolved.type === "link") {
          rewrite(resolved);
        }
        continue;
      }
      if (isParent(child)) {
        rewrite(child);
      }
      replaced.push(child);
    }
    parent.children = replaced;
  };

  rewrite(tree);
};
