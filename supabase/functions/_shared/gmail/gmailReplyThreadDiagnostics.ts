/**
 * Operator-facing Gmail reply threading diagnostics (no I/O).
 * Kept separate from `gmailOperatorSend.ts` so Vitest can import it without Deno `npm:` chains.
 */

/** Observable error when Gmail assigns a different thread id after send (no body / PII beyond subject line). */
export function buildGmailReplyThreadMismatchError(opts: {
  expectedGmailThreadId: string;
  actualGmailThreadId: string;
  anchorProviderMessageId: string;
  anchorRfcMessageIdFound: boolean;
  anchorSubjectFound: boolean;
  finalSubject: string;
}): string {
  const finalSubjectSafe = opts.finalSubject
    .replace(/\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return (
    `Gmail associated this send with a different conversation than this Atelier thread (expected Gmail thread ${opts.expectedGmailThreadId}, got ${opts.actualGmailThreadId}). Not saved in Atelier — check Gmail if the message was still delivered. ` +
    `threading_diag expected_gmail_thread_id=${opts.expectedGmailThreadId} actual_gmail_thread_id=${opts.actualGmailThreadId} ` +
    `anchor_provider_message_id=${opts.anchorProviderMessageId} anchor_rfc_message_id_found=${opts.anchorRfcMessageIdFound} ` +
    `anchor_subject_found=${opts.anchorSubjectFound} final_subject=${finalSubjectSafe}`
  );
}
