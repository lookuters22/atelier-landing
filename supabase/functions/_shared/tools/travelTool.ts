import { z } from "npm:zod@4";
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import { TravelToolInputSchema } from "./schemas.ts";

type TravelToolInput = z.infer<typeof TravelToolInputSchema>;

/** Stable 0..max-1 from strings (deterministic mock pricing). */
function seedBucket(parts: string[], max: number): number {
  let h = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h = (h * 31 + p.charCodeAt(i)) >>> 0;
    }
  }
  return max > 0 ? h % max : 0;
}

function buildMockTravelPayload(
  input: TravelToolInput,
  photographerId: string,
): Record<string, unknown> {
  const t0 = new Date(input.startDate).getTime();
  const t1 = new Date(input.endDate).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1)) {
    throw new Error("Invalid startDate or endDate");
  }

  const nights = Math.max(1, Math.ceil((t1 - t0) / (24 * 60 * 60 * 1000)));
  const base = [
    input.origin,
    input.destination,
    input.startDate,
    input.endDate,
    photographerId,
  ];

  const flightBase = 400 + seedBucket(base, 800) + seedBucket([photographerId], 200);
  const hotelNightly = 120 + seedBucket([...base, "hotel"], 180);

  const flightOptions = [
    {
      id: `flt-mock-${photographerId.slice(0, 8)}-a`,
      carrier: "Mock Airways",
      route: `${input.origin} → ${input.destination}`,
      cabin: "economy",
      departure: `${input.startDate}T09:30:00.000Z`,
      arrival: `${input.startDate}T12:45:00.000Z`,
      priceUsd: flightBase,
      notes: "Nonstop (mock)",
    },
    {
      id: `flt-mock-${photographerId.slice(0, 8)}-b`,
      carrier: "Sample Jet",
      route: `${input.origin} → ${input.destination}`,
      cabin: "economy",
      departure: `${input.startDate}T14:10:00.000Z`,
      arrival: `${input.startDate}T18:20:00.000Z`,
      priceUsd: flightBase + 140 + seedBucket([...base, "b"], 90),
      notes: "One stop (mock)",
    },
    {
      id: `flt-mock-${photographerId.slice(0, 8)}-c`,
      carrier: "Placeholder Airlines",
      route: `${input.origin} → ${input.destination}`,
      cabin: "premium_economy",
      departure: `${input.startDate}T07:00:00.000Z`,
      arrival: `${input.startDate}T11:30:00.000Z`,
      priceUsd: flightBase + 310 + seedBucket([...base, "c"], 120),
      notes: "Morning option (mock)",
    },
  ];

  const hotelOptions = [
    {
      id: `htl-mock-${photographerId.slice(0, 8)}-1`,
      name: `The Mock Hotel — ${input.destination}`,
      nights,
      pricePerNightUsd: hotelNightly,
      totalStayUsd: Math.round(hotelNightly * nights),
      breakfastIncluded: true,
    },
    {
      id: `htl-mock-${photographerId.slice(0, 8)}-2`,
      name: `Riverside Place (${input.destination})`,
      nights,
      pricePerNightUsd: hotelNightly + 45 + seedBucket([...base, "h2"], 40),
      totalStayUsd: Math.round((hotelNightly + 45 + seedBucket([...base, "h2"], 40)) * nights),
      breakfastIncluded: false,
    },
  ];

  return {
    origin: input.origin,
    destination: input.destination,
    photographerId,
    flightOptions,
    hotelOptions,
  };
}

/**
 * Mock travel search (Phase 3). No external APIs.
 */
export async function executeTravelTool(
  input: z.infer<typeof TravelToolInputSchema>,
  photographerId: string,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const facts = buildMockTravelPayload(input, photographerId);
    return {
      success: true,
      facts,
      confidence: 1,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      facts: {},
      confidence: 0,
      error: message,
    };
  }
}
