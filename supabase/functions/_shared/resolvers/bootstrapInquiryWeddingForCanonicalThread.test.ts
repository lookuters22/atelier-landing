import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import {
  bootstrapInquiryProjectForCanonicalThread,
  bootstrapInquiryWeddingForCanonicalThread,
} from "./bootstrapInquiryWeddingForCanonicalThread.ts";

type WeddingProjectType = Database["public"]["Enums"]["wedding_project_type"];

const photographerId = "550e8400-e29b-41d4-a716-446655440000";
const threadId = "660e8400-e29b-41d4-a716-446655440001";
const newWeddingId = "770e8400-e29b-41d4-a716-446655440002";
const existingWeddingId = "880e8400-e29b-41d4-a716-446655440003";

function mockBootstrapSupabase(opts: {
  threadWeddingId: string | null;
  onWeddingInsert?: (row: Record<string, unknown>) => void;
  onThreadUpdate?: (row: Record<string, unknown>) => void;
}): SupabaseClient {
  let step = 0;
  const threadRow = {
    id: threadId,
    wedding_id: opts.threadWeddingId,
    photographer_id: photographerId,
    title: "Subject line",
  };

  const threadSelectChain = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: threadRow, error: null }),
        }),
      }),
    }),
  };

  const threadUpdateChain = {
    update: (payload: Record<string, unknown>) => {
      opts.onThreadUpdate?.(payload);
      return {
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    },
  };

  const weddingInsertChain = {
    insert: (row: Record<string, unknown>) => {
      opts.onWeddingInsert?.(row);
      return {
        select: () => ({
          single: async () => ({ data: { id: newWeddingId }, error: null }),
        }),
      };
    },
  };

  const clientsInsertChain = {
    insert: async () => ({ error: null }),
  };

  return {
    from: (table: string) => {
      step++;
      if (opts.threadWeddingId) {
        expect(step).toBe(1);
        expect(table).toBe("threads");
        return threadSelectChain;
      }
      if (step === 1) {
        expect(table).toBe("threads");
        return threadSelectChain;
      }
      if (step === 2) {
        expect(table).toBe("weddings");
        return weddingInsertChain;
      }
      if (step === 3) {
        expect(table).toBe("clients");
        return clientsInsertChain;
      }
      if (step === 4) {
        expect(table).toBe("threads");
        return threadUpdateChain;
      }
      throw new Error(`unexpected from("${table}") at step ${step}`);
    },
  } as unknown as SupabaseClient;
}

describe("bootstrapInquiryWeddingForCanonicalThread", () => {
  it("defaults project_type to wedding when omitted", async () => {
    let inserted: Record<string, unknown> | undefined;
    const supabase = mockBootstrapSupabase({
      threadWeddingId: null,
      onWeddingInsert: (row) => {
        inserted = row;
      },
    });
    await bootstrapInquiryWeddingForCanonicalThread(supabase, {
      photographerId,
      threadId,
      rawMessagePreview: "Hello",
      senderEmail: "a@b.com",
      threadTitle: "Hi",
    });
    expect(inserted?.project_type).toBe("wedding");
    expect(inserted?.stage).toBe("inquiry");
  });

  it("writes commercial when projectType is commercial", async () => {
    let inserted: Record<string, unknown> | undefined;
    const supabase = mockBootstrapSupabase({
      threadWeddingId: null,
      onWeddingInsert: (row) => {
        inserted = row;
      },
    });
    await bootstrapInquiryWeddingForCanonicalThread(supabase, {
      photographerId,
      threadId,
      rawMessagePreview: "Hello",
      senderEmail: "a@b.com",
      projectType: "commercial",
    });
    expect(inserted?.project_type).toBe("commercial");
  });

  it("writes another allowed non-wedding project type", async () => {
    let inserted: Record<string, unknown> | undefined;
    const supabase = mockBootstrapSupabase({
      threadWeddingId: null,
      onWeddingInsert: (row) => {
        inserted = row;
      },
    });
    const projectType: WeddingProjectType = "editorial";
    await bootstrapInquiryWeddingForCanonicalThread(supabase, {
      photographerId,
      threadId,
      rawMessagePreview: "Hello",
      senderEmail: null,
      projectType,
    });
    expect(inserted?.project_type).toBe("editorial");
  });

  it("links thread to new wedding_id and clears ai_routing_metadata", async () => {
    let updated: Record<string, unknown> | undefined;
    const supabase = mockBootstrapSupabase({
      threadWeddingId: null,
      onThreadUpdate: (row) => {
        updated = row;
      },
    });
    const r = await bootstrapInquiryWeddingForCanonicalThread(supabase, {
      photographerId,
      threadId,
      rawMessagePreview: "Hello",
      senderEmail: "x@y.com",
    });
    expect(r.weddingId).toBe(newWeddingId);
    expect(updated?.wedding_id).toBe(newWeddingId);
    expect(updated?.ai_routing_metadata).toBeNull();
  });

  it("returns existing wedding_id without insert when thread already linked", async () => {
    const supabase = mockBootstrapSupabase({ threadWeddingId: existingWeddingId });
    const r = await bootstrapInquiryWeddingForCanonicalThread(supabase, {
      photographerId,
      threadId,
      rawMessagePreview: "Hello",
      senderEmail: null,
    });
    expect(r.weddingId).toBe(existingWeddingId);
  });

  it("rejects invalid projectType at runtime", async () => {
    const supabase = mockBootstrapSupabase({ threadWeddingId: null });
    await expect(
      bootstrapInquiryWeddingForCanonicalThread(supabase, {
        photographerId,
        threadId,
        rawMessagePreview: "Hello",
        senderEmail: null,
        projectType: "not_a_type" as WeddingProjectType,
      }),
    ).rejects.toThrow(/Invalid projectType/);
  });

  it("exposes bootstrapInquiryProjectForCanonicalThread as the same function", () => {
    expect(bootstrapInquiryProjectForCanonicalThread).toBe(bootstrapInquiryWeddingForCanonicalThread);
  });
});
