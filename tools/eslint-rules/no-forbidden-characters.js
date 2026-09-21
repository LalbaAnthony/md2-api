import { describeFinding, findForbiddenCharacters } from "../forbidden-characters.mjs";

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid emoji, en dashes and em dashes anywhere in the repository.",
    },
    schema: [],
    messages: {
      forbidden: "{{explanation}}",
    },
  },
  create(context) {
    return {
      Program() {
        for (const finding of findForbiddenCharacters(context.sourceCode.getText())) {
          context.report({
            loc: {
              start: { line: finding.line, column: finding.column - 1 },
              end: { line: finding.line, column: finding.column },
            },
            messageId: "forbidden",
            data: { explanation: describeFinding(finding) },
          });
        }
      },
    };
  },
};

export default rule;
