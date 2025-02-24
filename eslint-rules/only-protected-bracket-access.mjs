/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/typedef */

/**
 * @type {import("eslint").Rule.RuleModule}
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only allow bracket notation for protected members (starting with '_')",
      recommended: false,
    },
    schema: [], // No options
    messages: {
      privateBracketAccess:
        "Do not use bracket notation to access private members (starting with '__').",
      publicBracketAccess:
        "Do not use bracket notation to access public members (no underscore prefix).",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed && node.property.type === "Literal") {
          const propertyName = node.property.value;

          if (typeof propertyName === "string") {
            if (!propertyName.startsWith("_")) {
              context.report({
                node,
                messageId: "publicBracketAccess",
              });
            } else if (propertyName.startsWith("__")) {
              context.report({
                node,
                messageId: "privateBracketAccess",
              });
            }
          }
        }
      },
    };
  },
};
