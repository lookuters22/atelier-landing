import { describe, expect, it } from "vitest";

import { buildGmailReplyThreadMismatchError } from "./gmailReplyThreadDiagnostics.ts";

describe("buildGmailReplyThreadMismatchError", () => {
  it("includes expected vs actual thread ids and threading diagnostics", () => {
    const msg = buildGmailReplyThreadMismatchError({
      expectedGmailThreadId: "threadA",
      actualGmailThreadId: "threadB",
      anchorProviderMessageId: "msgAnchor123",
      anchorRfcMessageIdFound: true,
      anchorSubjectFound: false,
      finalSubject: "Re: Test subject",
    });
    expect(msg).toContain("expected Gmail thread threadA");
    expect(msg).toContain("got threadB");
    expect(msg).toContain("threading_diag");
    expect(msg).toContain("expected_gmail_thread_id=threadA");
    expect(msg).toContain("actual_gmail_thread_id=threadB");
    expect(msg).toContain("anchor_provider_message_id=msgAnchor123");
    expect(msg).toContain("anchor_rfc_message_id_found=true");
    expect(msg).toContain("anchor_subject_found=false");
    expect(msg).toContain("final_subject=Re: Test subject");
  });

  it("strips newlines from final_subject in diagnostics", () => {
    const msg = buildGmailReplyThreadMismatchError({
      expectedGmailThreadId: "a",
      actualGmailThreadId: "b",
      anchorProviderMessageId: "m",
      anchorRfcMessageIdFound: false,
      anchorSubjectFound: true,
      finalSubject: "Re: Bad\r\nSubject",
    });
    expect(msg).toContain("final_subject=Re: Bad Subject");
    expect(msg).not.toMatch(/final_subject=.*\r/);
  });
});

describe("sendGmailReplyAndInsertMessage — reply subject contract (static)", () => {
  it("resolves subject via resolveGmailReplySubjectLine (anchor metadata over thread.title)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "supabase/functions/_shared/gmail/gmailOperatorSend.ts"),
      "utf-8",
    );
    const fnIdx = src.indexOf("export async function sendGmailReplyAndInsertMessage");
    const nextFn = src.indexOf("\nexport async function sendGmailComposeNewThreadAndInsert", fnIdx);
    expect(fnIdx).toBeGreaterThan(-1);
    expect(nextFn).toBeGreaterThan(fnIdx);
    const replyFnBody = src.slice(fnIdx, nextFn);
    expect(replyFnBody).toContain("resolveGmailReplySubjectLine");
    expect(replyFnBody).not.toMatch(/params\.subject\.trim\(\)\s*\|\|\s*`Re:\s*\$\{/);
  });
});

describe("sendGmailReplyForApprovedDraft — subject inheritance", () => {
  it("passes empty subject into sendGmailReplyAndInsertMessage so anchor Gmail Subject wins", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "supabase/functions/_shared/gmail/gmailOperatorSend.ts"),
      "utf-8",
    );
    const fnIdx = src.indexOf("export async function sendGmailReplyForApprovedDraft");
    const emptySubjectIdx = src.indexOf('subject: ""');
    expect(fnIdx).toBeGreaterThan(-1);
    expect(emptySubjectIdx).toBeGreaterThan(fnIdx);
  });
});
