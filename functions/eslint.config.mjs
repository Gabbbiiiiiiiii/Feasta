import js from "eslint/use-at-your-own-risk";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["lib/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "quotes": ["error", "double"],
      "semi": ["error", "always"],
      "object-curly-spacing": ["error", "never"],
      "max-len": ["warn", {code: 100}],
    },
  },
];