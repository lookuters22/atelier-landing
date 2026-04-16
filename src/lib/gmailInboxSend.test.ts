import { describe, expect, it, vi } from "vitest";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

vi.mock("./supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from "./supabase";
import {
  humanizeGmailSendBackendError,
  humanizeGmailSendInvokeError,
  invokeGmailInboxSendReply,
} from "./gmailInboxSend";

describe("humanizeGmailSendInvokeError", () => {
  it("maps FunctionsFetchError to deploy/network guidance", async () => {
    const msg = await humanizeGmailSendInvokeError(new FunctionsFetchError(new TypeError("aborted")));
    expect(msg).toContain("gmail-send");
    expect(msg).toContain("VITE_SUPABASE_URL");
  });

  it("maps FunctionsHttpError 401 to session copy", async () => {
    const res = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const err = new FunctionsHttpError(res);
    const msg = await humanizeGmailSendInvokeError(err);
    expect(msg.toLowerCase()).toMatch(/session|sign in/);
  });

  it("maps FunctionsHttpError 404 to not-deployed copy", async () => {
    const res = new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    const err = new FunctionsHttpError(res);
    const msg = await humanizeGmailSendInvokeError(err);
    expect(msg).toContain("gmail-send");
  });

  it("parses JSON error body on FunctionsHttpError", async () => {
    const res = new Response(JSON.stringify({ error: "OAuth tokens not found for this account" }), {
      status: 400,
    });
    const err = new FunctionsHttpError(res);
    const msg = await humanizeGmailSendInvokeError(err);
    expect(msg).toContain("Reconnect Google");
  });
});

describe("humanizeGmailSendBackendError", () => {
  it("maps OAuth token errors to reconnect copy", () => {
    expect(humanizeGmailSendBackendError("OAuth tokens not found for this account")).toContain("Reconnect Google");
  });
});

describe("invokeGmailInboxSendReply", () => {
  it("humanizes generic non-2xx edge message from backend string", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Edge Function returned a non-2xx status code"),
    });
    const r = await invokeGmailInboxSendReply({
      connectedAccountId: "00000000-0000-4000-8000-000000000001",
      threadId: "00000000-0000-4000-8000-000000000002",
      to: "a@b.com",
      cc: "",
      bcc: "",
      subject: "Re: Hi",
      body: "x",
      inReplyToProviderMessageId: "mid",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("connection");
    }
  });

  it("humanizes FunctionsFetchError via invoke", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new FunctionsFetchError(new TypeError("network")),
    });
    const r = await invokeGmailInboxSendReply({
      connectedAccountId: "00000000-0000-4000-8000-000000000001",
      threadId: "00000000-0000-4000-8000-000000000002",
      to: "a@b.com",
      cc: "",
      bcc: "",
      subject: "Re: Hi",
      body: "x",
      inReplyToProviderMessageId: "mid",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("gmail-send");
    }
  });
});
