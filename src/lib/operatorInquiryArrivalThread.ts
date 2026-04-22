import { deriveInboxThreadBucket } from "./inboxThreadBucket.ts";
import { INQUIRY_STAGES } from "./inboxVisibleThreads.ts";

/**
 * True when a thread’s first-inbound time should count as a **new pre-booking inquiry** for operator
 * analytics: linked rows only in {@link INQUIRY_STAGES}, unlinked rows only in the
 * `deriveInboxThreadBucket` **inquiry** bucket (e.g. `customer_lead`).
 */
export function isOperatorInquiryArrivalThread(args: {
  weddingId: string | null;
  weddingStage: string | null;
  ai_routing_metadata: unknown;
}): boolean {
  if (args.weddingId) {
    const st = args.weddingStage;
    if (st == null || st.trim() === "") return false;
    return INQUIRY_STAGES.has(st);
  }
  return (
    deriveInboxThreadBucket({
      weddingId: null,
      ai_routing_metadata: args.ai_routing_metadata,
    }) === "inquiry"
  );
}
