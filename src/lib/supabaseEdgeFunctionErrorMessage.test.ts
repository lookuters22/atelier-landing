import { describe, expect, it } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseEdgeFunctionErrorMessage } from "./supabaseEdgeFunctionErrorMessage.ts";

describe("getSupabaseEdgeFunctionErrorMessage", () => {
  it("uses invoke data.error when the client already parsed JSON", async () => {
    const text = await getSupabaseEdgeFunctionErrorMessage(new Error("ignored"), {
      error: "column memories.scope does not exist",
    });
    expect(text).toBe("column memories.scope does not exist");
  });

  it("reads JSON body from FunctionsHttpError.context", async () => {
    const res = new Response(JSON.stringify({ error: "from edge" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    const err = new FunctionsHttpError(res);
    const text = await getSupabaseEdgeFunctionErrorMessage(err, null);
    expect(text).toBe("from edge");
  });

  it("falls back to Error.message if body has no error string", async () => {
    const res = new Response(JSON.stringify({}), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    const err = new FunctionsHttpError(res);
    const text = await getSupabaseEdgeFunctionErrorMessage(err, null);
    expect(text).toContain("non-2xx");
  });
});
