import {fileURLToPath, URL} from "node:url";

import {defineConfig} from "vitest/config";

export default defineConfig({
  // Keep generated test caches in this worktree when node_modules is shared.
  cacheDir: fileURLToPath(new URL("./.next/cache/vitest", import.meta.url)),
  resolve: {
    alias: {
      "@feasta/shared-types/customer-package-v2": fileURLToPath(new URL("../../packages/shared-types/dist/customer-package-v2.cjs", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/components/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    testTimeout: 15000,
  },
});
