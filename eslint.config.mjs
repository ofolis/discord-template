/* eslint-disable @typescript-eslint/naming-convention */
// @ts-check

import eslint from "@eslint/js";
import moduleBindingsNewline from "eslint-plugin-module-bindings-newline";
import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    "plugins": {
      "@stylistic": stylistic,
      "module-bindings-newline": moduleBindingsNewline,
    },
    "rules": {
      "@stylistic/array-bracket-newline": [
        "error",
        "always",
      ],
      "@stylistic/array-bracket-spacing": [
        "error",
      ],
      "@stylistic/array-element-newline": [
        "error",
        {
          "multiline": true,
          "minItems": 1,
        },
      ],
      "@stylistic/arrow-spacing": [
        "error",
      ],
      "@stylistic/block-spacing": [
        "error",
      ],
      "@stylistic/comma-dangle": [
        "error",
        {
          "arrays": "always-multiline",
          "dynamicImports": "always-multiline",
          "enums": "always-multiline",
          "exports": "always-multiline",
          "functions": "always-multiline",
          "generics": "always-multiline",
          "importAttributes": "always-multiline",
          "imports": "always-multiline",
          "objects": "always-multiline",
          "tuples": "always-multiline",
        },
      ],
      "@stylistic/comma-spacing": [
        "error",
      ],
      "@stylistic/comma-style": [
        "error",
      ],
      "@stylistic/computed-property-spacing": [
        "error",
      ],
      "@stylistic/eol-last": [
        "error",
      ],
      "@stylistic/function-call-argument-newline": [
        "error",
      ],
      "@stylistic/function-call-spacing": [
        "error",
      ],
      "@stylistic/function-paren-newline": [
        "error",
        "multiline-arguments",
      ],
      "@stylistic/generator-star-spacing": [
        "error",
      ],
      "@stylistic/indent": [
        "error",
        2,
      ],
      "@stylistic/key-spacing": [
        "error",
      ],
      "@stylistic/keyword-spacing": [
        "error",
      ],
      "@stylistic/lines-between-class-members": [
        "error",
      ],
      "@typescript-eslint/no-inferrable-types": [
        "off",
      ],
      "@stylistic/no-multiple-empty-lines": [
        "error",
        {
          "max": 1,
          "maxEOF": 0,
          "maxBOF": 0,
        },
      ],
      "@stylistic/no-trailing-spaces": [
        "error",
      ],
      "@stylistic/no-whitespace-before-property": [
        "error",
      ],
      "@stylistic/object-curly-newline": [
        "error",
        {
          "ObjectExpression": {
            "multiline": true,
            "minProperties": 1,
          },
          "ObjectPattern": {
            "multiline": true,
            "minProperties": 1,
          },
          "ImportDeclaration": {
            "multiline": true,
            "minProperties": 1,
          },
          "ExportDeclaration": {
            "multiline": true,
            "minProperties": 1,
          },
        },
      ],
      "@stylistic/object-curly-spacing": [
        "error",
      ],
      "@stylistic/object-property-newline": [
        "error",
        {
          "allowAllPropertiesOnSameLine": false,
          "allowMultiplePropertiesPerLine": false,
        },
      ],
      "@stylistic/one-var-declaration-per-line": [
        "error",
      ],
      "@stylistic/operator-linebreak": [
        "error",
      ],
      "@stylistic/padded-blocks": [
        "error",
        "never",
      ],
      "@stylistic/quote-props": [
        "error",
      ],
      "@stylistic/rest-spread-spacing": [
        "error",
      ],
      "@stylistic/semi": [
        "error",
      ],
      "@stylistic/semi-spacing": [
        "error",
      ],
      "@stylistic/semi-style": [
        "error",
      ],
      "@stylistic/space-before-blocks": [
        "error",
      ],
      "@stylistic/space-before-function-paren": [
        "error",
        "never",
      ],
      "@stylistic/space-in-parens": [
        "error",
      ],
      "@stylistic/space-infix-ops": [
        "error",
      ],
      "@stylistic/space-unary-ops": [
        "error",
      ],
      "@stylistic/spaced-comment": [
        "error",
      ],
      "@stylistic/switch-colon-spacing": [
        "error",
      ],
      "@stylistic/template-curly-spacing": [
        "error",
      ],
      "@stylistic/template-tag-spacing": [
        "error",
      ],
      "@stylistic/type-annotation-spacing": [
        "error",
      ],
      "@stylistic/type-generic-spacing": [
        "error",
      ],
      "@stylistic/type-named-tuple-spacing": [
        "error",
      ],
      "@stylistic/wrap-regex": [
        "error",
      ],
      "@typescript-eslint/consistent-type-definitions": [
        "error",
        "type",
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          "selector": "default",
          "format": [
            "camelCase",
          ],
          "leadingUnderscore": "allow",
        },
        {
          "selector": "enumMember",
          "format": [
            "UPPER_CASE",
          ],
        },
        {
          "selector": "typeLike",
          "format": [
            "PascalCase",
          ],
        },
      ],
      "@typescript-eslint/no-extraneous-class": [
        "off",
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
        },
      ],
      "@typescript-eslint/typedef": [
        "error",
        {
          "variableDeclaration": true,
          "variableDeclarationIgnoreFunction": false,
        },
      ],
      "complexity": [
        "error",
      ],
      "module-bindings-newline/export": [
        "error",
      ],
      "module-bindings-newline/import": [
        "error",
      ],
    },
  },
);
