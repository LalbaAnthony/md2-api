const toPosixPath = (filename) => filename.replaceAll("\\", "/");

const isInsideTypesDirectory = (filename) => toPosixPath(filename).includes("/src/types/");

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep every type and interface declaration under src/types/, and keep src/types/ free of runtime values.",
    },
    schema: [],
    messages: {
      declarationOutside: "Declare '{{name}}' under src/types/ and import it with 'import type'.",
      valueInside: "src/types/ holds declarations only, move '{{name}}' to a module of its domain.",
    },
  },
  create(context) {
    const inTypesDirectory = isInsideTypesDirectory(context.filename);

    const reportDeclarationOutside = (node, name) => {
      if (inTypesDirectory) {
        return;
      }
      context.report({ node, messageId: "declarationOutside", data: { name } });
    };

    const reportValueInside = (node, name) => {
      if (!inTypesDirectory) {
        return;
      }
      context.report({ node, messageId: "valueInside", data: { name } });
    };

    return {
      TSTypeAliasDeclaration(node) {
        reportDeclarationOutside(node, node.id.name);
      },
      TSInterfaceDeclaration(node) {
        reportDeclarationOutside(node, node.id.name);
      },
      VariableDeclaration(node) {
        if (node.declare === true) {
          return;
        }
        const firstDeclarator = node.declarations[0];
        const name =
          firstDeclarator !== undefined && firstDeclarator.id.type === "Identifier"
            ? firstDeclarator.id.name
            : "value";
        reportValueInside(node, name);
      },
      FunctionDeclaration(node) {
        reportValueInside(node, node.id === null ? "function" : node.id.name);
      },
      ClassDeclaration(node) {
        reportValueInside(node, node.id === null ? "class" : node.id.name);
      },
    };
  },
};

export default rule;
