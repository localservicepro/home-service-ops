import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["app/**/*.spec.tsx", "app/**/*.test.ts"],
  },
});
