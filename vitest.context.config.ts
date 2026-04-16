import path from "node:path";
import { defineConfig } from "vitest/config";

/** Resolves Deno-style `npm:@supabase/supabase-js@2` imports in `supabase/functions` for Vitest. */
export default defineConfig({
  resolve: {
    alias: {
      "npm:@supabase/supabase-js@2": path.resolve(
        "node_modules/@supabase/supabase-js",
      ),
      /** Deno `npm:zod@4` in `supabase/functions/_shared/tools/schemas.ts` */
      "npm:zod@4": path.resolve("node_modules/zod"),
      /** Deno `npm:inngest@3` in `supabase/functions/_shared/inngest.ts` */
      "npm:inngest@3": path.resolve("node_modules/inngest"),
      /** Deno `npm:sanitize-html@2.13.0` in `supabase/functions/_shared/gmail/gmailHtmlSanitize.ts` */
      "npm:sanitize-html@2.13.0": path.resolve("node_modules/sanitize-html"),
    },
  },
  test: {
    include: [
      "supabase/functions/_shared/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "src/hooks/**/*.test.ts",
    ],
    environment: "node",
  },
});
