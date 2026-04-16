import { describe, expect, it } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { humanizeDraftApprovalInvokeError } from "./draftApprovalClient";

describe("humanizeDraftApprovalInvokeError", () => {
  it("maps stale draft 409 message from api-resolve-draft", async () => {
    const res = new Response(
      JSON.stringify({
        ok: false,
        action: "approval_rejected_stale_draft",
        error: "stale_draft",
        message:
          "New client message arrived after this draft was created. This draft was invalidated so nothing is sent. Ana should re-evaluate with the latest thread context.",
      }),
      { status: 409 },
    );
    const err = new FunctionsHttpError(res);
    await expect(humanizeDraftApprovalInvokeError(err)).resolves.toContain("invalidated");
  });

  it("maps not-pending 409 with draft_status", async () => {
    const res = new Response(
      JSON.stringify({
        error: "Draft is not pending approval",
        status: "approved",
      }),
      { status: 409 },
    );
    const err = new FunctionsHttpError(res);
    await expect(humanizeDraftApprovalInvokeError(err)).resolves.toContain("no longer pending");
  });

  it("maps 403 access denied", async () => {
    const res = new Response(JSON.stringify({ error: "Draft not found or access denied" }), {
      status: 403,
    });
    const err = new FunctionsHttpError(res);
    await expect(humanizeDraftApprovalInvokeError(err)).resolves.toContain("access");
  });

  it("maps gateway ES256 / unsupported algorithm 401 to diagnostic copy (not generic session expiry)", async () => {
    const res = new Response(
      JSON.stringify({
        code: "UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM",
        message: "Unsupported JWT algorithm ES256",
      }),
      { status: 401 },
    );
    const err = new FunctionsHttpError(res);
    const msg = await humanizeDraftApprovalInvokeError(err);
    expect(msg).toContain("ES256");
    expect(msg).toContain("verify_jwt");
    expect(msg).not.toMatch(/session expired/i);
  });

  it("maps plain 401 without ES256 hint to session / auth copy", async () => {
    const res = new Response(JSON.stringify({}), { status: 401 });
    const err = new FunctionsHttpError(res);
    await expect(humanizeDraftApprovalInvokeError(err)).resolves.toMatch(/session expired|sign in/i);
  });
});
