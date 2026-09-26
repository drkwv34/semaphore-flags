import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": "error",
    },
  },
  {
    // Domain must stay pure: no I/O, no framework, no infrastructure imports.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "fastify",
                "fastify/*",
                "pg",
                "ioredis",
                "redis",
                "node:fs",
                "node:net",
                "node:http",
              ],
              message: "src/domain is pure. Do I/O in src/store, src/cache or src/api.",
            },
            {
              group: ["**/api/**", "**/store/**", "**/cache/**", "**/metrics/**"],
              message: "src/domain must not depend on outer layers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.{ts,js,mjs}"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
