const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid every comment, explanations belong in docs/.",
    },
    schema: [],
    messages: {
      forbidden: "Comments are forbidden here. Name the code or document it under docs/.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          context.report({ loc: comment.loc, messageId: "forbidden" });
        }
      },
    };
  },
};

export default rule;
