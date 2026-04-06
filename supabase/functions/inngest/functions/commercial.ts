/**
 * Commercial Worker — Quote Assembly (read-only CRM in Slice 3).
 *
 * Listens for ai/intent.commercial.
 *
 * 1. Fetch the wedding record for package_name and story_notes.
 * 2. Calculate the total quote: base package price + travel costs
 *    (extracted from story_notes when present).
 *
 * Slice 3: does not mutate `weddings` — CRM stage/contract updates belong on the strict tool/verifier path.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const PACKAGE_PRICES: Record<string, number> = {
  "The Heirloom": 8500,
  "The Editorial": 10500,
  "Digital Only": 6000,
};

const DEFAULT_PACKAGE_PRICE = 8500;

/**
 * Parses the "Total: CUR NNNN" line written by the Logistics Worker.
 * Returns the numeric travel cost, or 0 if none found.
 */
function extractTravelCost(storyNotes: string | null): number {
  if (!storyNotes) return 0;
  const match = storyNotes.match(/^Total:\s*\w{3}\s+([\d.]+)/m);
  return match ? parseFloat(match[1]) : 0;
}

export const commercialFunction = inngest.createFunction(
  { id: "commercial-worker", name: "Commercial Worker — Quote Assembly" },
  { event: "ai/intent.commercial" },
  async ({ event, step }) => {
    const { wedding_id, photographer_id } = event.data;

    if (!photographer_id || typeof photographer_id !== "string") {
      throw new Error("ai/intent.commercial: missing photographer_id (tenant-proof required)");
    }

    const wedding = await step.run("fetch-wedding", async () => {
      const { data, error } = await supabaseAdmin
        .from("weddings")
        .select("id, photographer_id, package_name, story_notes, contract_value, stage")
        .eq("id", wedding_id)
        .eq("photographer_id", photographer_id)
        .single();

      if (error || !data) {
        throw new Error(`Wedding not found: ${error?.message ?? wedding_id}`);
      }

      return data as {
        id: string;
        photographer_id: string;
        package_name: string | null;
        story_notes: string | null;
        contract_value: number | null;
        stage: string;
      };
    });

    const quote = await step.run("calculate-quote", () => {
      const packageName = wedding.package_name ?? "";
      const basePrice = PACKAGE_PRICES[packageName] ?? DEFAULT_PACKAGE_PRICE;
      const travelCost = extractTravelCost(wedding.story_notes);
      const totalValue = basePrice + travelCost;

      return {
        packageName: packageName || "(default)",
        basePrice,
        travelCost,
        totalValue,
      };
    });

    return {
      status: "quote_computed_crm_write_skipped",
      wedding_id,
      package: quote.packageName,
      base_price: quote.basePrice,
      travel_cost: quote.travelCost,
      total_value: quote.totalValue,
    };
  },
);
