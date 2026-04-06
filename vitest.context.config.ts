import path from "node:path";
import { defineConfig } from "vitest/config";

/** Resolves Deno-style `npm:@supabase/supabase-js@2` imports in `supabase/functions` for Vitest. */
export default defineConfig({
  resolve: {
    alias: {
      "npm:@supabase/supabase-js@2": path.resolve(
        "node_modules/@supabase/supabase-js",
      ),
    },
  },
  test: {
    include: [
      "supabase/functions/_shared/**/*.test.ts",
      "src/lib/**/*.test.ts",
    ],
    environment: "node",
  },
});
