import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";

export type SendMessageParams = {
  threadId: string;
  photographerId: string;
  body: string;
  isInternal: boolean;
};

export type SendMessageResult =
  | { success: true }
  | { success: false; error: string };

export function useSendMessage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (params: SendMessageParams): Promise<SendMessageResult> => {
    const { threadId, photographerId, body, isInternal } = params;
    const trimmed = body.trim();
    if (!trimmed) {
      setError(null);
      return { success: false, error: "Message is empty." };
    }

    setIsLoading(true);
    setError(null);

    const fail = (msg: string): SendMessageResult => {
      setError(msg);
      return { success: false, error: msg };
    };

    try {
      const { data: thread, error: threadErr } = await supabase
        .from("threads")
        .select("id, wedding_id, photographer_id")
        .eq("id", threadId)
        .maybeSingle();

      if (threadErr || !thread) {
        return fail(threadErr?.message ?? "Thread not found.");
      }

      if (thread.photographer_id !== photographerId) {
        return fail("Not allowed for this thread.");
      }

      // Slice 3: client-facing outbound must not bypass approval / outbound policy (no direct insert).
      if (!isInternal) {
        return fail(
          "Client-facing messages cannot be sent from here. Use draft approval and the outbound pipeline.",
        );
      }

      const { error: insertErr } = await supabase.from("messages").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "internal",
        sender: "Studio",
        body: trimmed,
      });

      if (insertErr) {
        return fail(insertErr.message);
      }

      setError(null);
      return { success: true };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sendMessage, isLoading, error };
}
