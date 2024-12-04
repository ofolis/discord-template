import love from "eslint-config-love";
import moduleBindingsNewline from "eslint-plugin-module-bindings-newline";
import stylistic from "@stylistic/eslint-plugin";

export default [
  {
    ...love,
    files: ["**/*.js", "**/*.ts"],
    ignores: ["dist/**/*"],
    plugins: {
      ...love.plugins,
      "@stylistic": stylistic,
      "module-bindings-newline": moduleBindingsNewline,
    },
    rules: {
      ...love.rules,
      "@stylistic/array-bracket-spacing": ["error"],
      "@stylistic/arrow-spacing": ["error"],
      "@stylistic/block-spacing": ["error"],
      "@stylistic/comma-dangle": [
        "error",
        {
          arrays: "always-multiline",
          objects: "always-multiline",
          imports: "always-multiline",
          exports: "always-multiline",
          functions: "always-multiline",
          importAttributes: "always-multiline",
          dynamicImports: "always-multiline",
        },
      ],
      "@stylistic/comma-spacing": ["error"],
      "@stylistic/comma-style": ["error"],
      "@stylistic/computed-property-spacing": ["error"],
      "@stylistic/eol-last": ["error"],
      "@stylistic/function-call-argument-newline": ["error"],
      "@stylistic/function-call-spacing": ["error"],
      "@stylistic/generator-star-spacing": ["error"],
      "@stylistic/key-spacing": ["error"],
      "@stylistic/keyword-spacing": ["error"],
      "@stylistic/lines-between-class-members": ["error"],
      "@stylistic/no-multiple-empty-lines": [
        "error",
        {
          max: 1,
          maxEOF: 0,
          maxBOF: 0,
        },
      ],
      "@stylistic/no-trailing-spaces": ["error"],
      "@stylistic/no-whitespace-before-property": ["error"],
      "@stylistic/object-curly-spacing": ["error"],
      "@stylistic/one-var-declaration-per-line": ["error"],
      "@stylistic/operator-linebreak": ["error"],
      "@stylistic/padded-blocks": ["error", "never"],
      "@stylistic/quote-props": ["error"],
      "@stylistic/rest-spread-spacing": ["error"],
      "@stylistic/semi-spacing": ["error"],
      "@stylistic/semi-style": ["error"],
      "@stylistic/space-before-blocks": ["error"],
      "@stylistic/space-before-function-paren": ["error", "never"],
      "@stylistic/space-in-parens": ["error"],
      "@stylistic/space-infix-ops": ["error"],
      "@stylistic/space-unary-ops": ["error"],
      "@stylistic/spaced-comment": ["error"],
      "@stylistic/switch-colon-spacing": ["error"],
      "@stylistic/template-curly-spacing": ["error"],
      "@stylistic/template-tag-spacing": ["error"],
      "@stylistic/type-annotation-spacing": ["error"],
      "@stylistic/type-generic-spacing": ["error"],
      "@stylistic/type-named-tuple-spacing": ["error"],
      "@stylistic/wrap-regex": ["error"],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/explicit-function-return-type": ["error"],
      "@typescript-eslint/no-extraneous-class": ["off"],
      "@typescript-eslint/typedef": [
        "error",
        {
          variableDeclaration: true,
          variableDeclarationIgnoreFunction: false,
        },
      ],
      "array-element-newline": [
        "error",
        {
          multiline: true,
          minItems: 1,
        },
      ],
      "function-paren-newline": ["error", "multiline"],
      "import/newline-after-import": ["error"],
      indent: ["error", 2],
      "module-bindings-newline/export": ["error"],
      "module-bindings-newline/import": ["error"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration > VariableDeclaration",
          message: "Only classes may be exported.",
        },
        {
          selector: "ExportNamedDeclaration > FunctionDeclaration",
          message: "Only classes may be exported.",
        },
      ],
      "object-curly-newline": [
        "error",
        {
          ObjectExpression: {
            multiline: true,
            minProperties: 1,
          },
          ObjectPattern: {
            multiline: true,
            minProperties: 1,
          },
          ImportDeclaration: {
            multiline: true,
            minProperties: 1,
          },
          ExportDeclaration: {
            multiline: true,
            minProperties: 1,
          },
        },
      ],
      "object-property-newline": [
        "error",
        {
          allowAllPropertiesOnSameLine: false,
          allowMultiplePropertiesPerLine: false,
        },
      ],
      semi: ["error", "always"],
    },
  },
];
