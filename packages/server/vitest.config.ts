import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Ensure SESSION_SECRET (or JWT_SECRET) is set before any test file
    // imports `../app` — buildSessionMiddleware() now throws at startup
    // when no secret is configured.
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
