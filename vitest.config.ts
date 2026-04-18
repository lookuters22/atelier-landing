import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest-only config — keeps the dev build lean (vite.config.ts stays minimal).
// React plugin is only required for tests that render components (selectors).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Default environment stays node (pure TS unit tests in supabase/ and most of src/).
    // Component tests opt in via `// @vitest-environment jsdom` at the top of the file.
    environment: "node",
    globals: false,
  },
});
