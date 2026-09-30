import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/build/**",
      "**/coverage/**",
    ],
  },
  {
    files: ["apps/api/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
);
