import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import noComments from "./tools/eslint-rules/no-comments.js";
import noCrossFormatImports from "./tools/eslint-rules/no-cross-format-imports.js";
import noForbiddenCharacters from "./tools/eslint-rules/no-forbidden-characters.js";
import typesLiveInTypesDir from "./tools/eslint-rules/types-live-in-types-dir.js";

const md2 = {
  rules: {
    "no-comments": noComments,
    "no-cross-format-imports": noCrossFormatImports,
    "no-forbidden-characters": noForbiddenCharacters,
    "types-live-in-types-dir": typesLiveInTypesDir,
  },
};

const TYPED_FILES = ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"];
const SCRIPT_FILES = ["tools/**/*.js", "tools/**/*.mjs", "eslint.config.js"];
const BRANDED_UNIT_BOUNDARY = ["src/units.ts"];
const RAW_JSON_BOUNDARY = [
  "src/theme/registry.ts",
  "src/config.ts",
  "src/formats/docx/theme-extension.ts",
];

const typedConfigs = tseslint.configs.strictTypeChecked.map((entry) => ({
  ...entry,
  files: TYPED_FILES,
}));

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "tests/visual/baseline/**"],
  },
  js.configs.recommended,
  {
    plugins: { md2 },
    rules: {
      "md2/no-forbidden-characters": "error",
    },
  },
  ...typedConfigs,
  {
    files: TYPED_FILES,
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      "md2/no-comments": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Enums are erasable syntax violations, use a literal union instead.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "md2/types-live-in-types-dir": "error",
      "md2/no-cross-format-imports": "error",
    },
  },
  {
    files: BRANDED_UNIT_BOUNDARY,
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
    },
  },
  {
    files: RAW_JSON_BOUNDARY,
    rules: {
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as" }],
    },
  },
  {
    files: ["src/routes/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["tools/forbidden-characters.mjs", "tools/check-repository-charset.mjs"],
    rules: {
      "md2/no-forbidden-characters": "off",
    },
  },
  {
    files: SCRIPT_FILES,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
);
