const FORMAT_SPECIFIC_PACKAGES = new Map([["docx", "docx"]]);

const toPosixPath = (filename) => filename.replaceAll("\\", "/");

const owningFormat = (filename) => {
  const match = /\/src\/formats\/([^/]+)\//.exec(toPosixPath(filename));
  return match === null ? null : match[1];
};

const isRendererFile = (filename) => /\/src\/formats\/[^/]+\/render\//.test(toPosixPath(filename));

const importedFormat = (specifier) => {
  const match = /(?:^|\/)formats\/([^/]+)\//.exec(toPosixPath(specifier));
  return match === null ? null : match[1];
};

const importsRawTheme = (specifier) => /types\/theme\.ts$/.test(toPosixPath(specifier));

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep format specific packages, cross backend imports and raw theme access out of the wrong module.",
    },
    schema: [],
    messages: {
      packageOutsideBackend:
        "The package '{{packageName}}' may only be imported under src/formats/{{format}}/**.",
      crossBackend:
        "Backend '{{owner}}' must not import backend '{{imported}}', share code through src/lib or src/types.",
      rawThemeInRenderer: "A renderer consumes its compiled theme only, never src/types/theme.ts.",
    },
  },
  create(context) {
    const owner = owningFormat(context.filename);
    const insideRenderer = isRendererFile(context.filename);

    const checkSpecifier = (node, specifier) => {
      for (const [format, packageName] of FORMAT_SPECIFIC_PACKAGES) {
        const matchesPackage = specifier === packageName || specifier.startsWith(`${packageName}/`);
        if (matchesPackage && owner !== format) {
          context.report({
            node,
            messageId: "packageOutsideBackend",
            data: { packageName, format },
          });
        }
      }

      const target = importedFormat(specifier);
      if (owner !== null && target !== null && target !== owner) {
        context.report({ node, messageId: "crossBackend", data: { owner, imported: target } });
      }

      if (insideRenderer && importsRawTheme(specifier)) {
        context.report({ node, messageId: "rawThemeInRenderer" });
      }
    };

    return {
      ImportDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null && node.source !== undefined) {
          checkSpecifier(node, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && typeof node.source.value === "string") {
          checkSpecifier(node, node.source.value);
        }
      },
    };
  },
};

export default rule;
