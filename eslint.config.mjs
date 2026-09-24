import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Architecture rule: UI code must reach data only through /src/services.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/**", "src/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/data", "@/data/*", "@/data/**"],
              message: "Import data through a service in @/services, never directly from @/data.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".agents/**"]),
]);

export default eslintConfig;
