/* eslint-disable @typescript-eslint/naming-convention */
// @ts-check

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/"],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["commitlint.config.mjs", "eslint.config.mjs"],
          defaultProject: "tsconfig.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/explicit-function-return-type": ["error"],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
      ],
      "@typescript-eslint/no-extraneous-class": ["off"],
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreIIFE: false,
          ignoreVoid: false,
        },
      ],
      "@typescript-eslint/no-inferrable-types": ["off"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowNullableObject: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      "@typescript-eslint/typedef": [
        "error",
        {
          variableDeclaration: true,
          variableDeclarationIgnoreFunction: false,
        },
      ],
      complexity: ["error"],
      curly: ["error"],
      eqeqeq: ["error"],
      "linebreak-style": ["error", "unix"],
      "require-await": ["error"],
    },
  },
  eslintConfigPrettier,
);
