import type { WeddingId } from "./weddingCatalog";

export type FlightLeg = {
  id: string;
  route: string;
  depart: string;
  arrive: string;
  airline: string;
  status: string;
};

export type HotelStay = {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  note?: string;
};

export type GroundSegment = {
  id: string;
  label: string;
  detail: string;
};

/** Agent-suggested options (demo until Amadeus + LangGraph backend). */
export type FlightOffer = {
  id: string;
  route: string;
  price: number;
  currency: string;
  source: "amadeus-mock" | "held";
  status: "pending_approval" | "approved" | "rejected";
  expiresAt: string;
};

export type TravelDaySegment =
  | { kind: "flight"; id: string; label: string; detail: string }
  | { kind: "hotel"; id: string; label: string; detail: string }
  | { kind: "ground"; id: string; label: string; detail: string };

export type TravelDay = {
  id: string;
  dateLabel: string;
  notes?: string;
  segments: TravelDaySegment[];
};

export type WeddingTravelPlan = {
  flights: FlightLeg[];
  hotels: HotelStay[];
  ground: GroundSegment[];
  /** Suggested offers from the logistics agent (demo). */
  flightOffers?: FlightOffer[];
  /** Multi-day itinerary timeline. */
  itineraryDays?: TravelDay[];
};

export const WEDDING_TRAVEL: Record<WeddingId, WeddingTravelPlan> = {
  "lake-como": {
    flights: [
      {
        id: "f1",
        route: "LHR → MXP",
        depart: "Wed 11 Jun · 07:40",
        arrive: "Wed 11 Jun · 10:55",
        airline: "BA",
        status: "Held (demo)",
      },
      {
        id: "f2",
        route: "MXP → FLR",
        depart: "Wed 11 Jun · 14:20",
        arrive: "Wed 11 Jun · 15:05",
        airline: "ITA",
        status: "Held (demo)",
      },
    ],
    hotels: [
      {
        id: "h1",
        name: "Borgo San Felice · near venue",
        checkIn: "Wed 11 Jun",
        checkOut: "Mon 16 Jun",
        note: "Block for crew + overflow suite",
      },
    ],
    ground: [
      {
        id: "g1",
        label: "Rental van",
        detail: "Sixt · Florence airport pickup · 11 Jun–16 Jun",
      },
      {
        id: "g2",
        label: "Planner transfer",
        detail: "Rehearsal night · Elena Rossi Planning",
      },
    ],
    flightOffers: [
      {
        id: "offer-lc-1",
        route: "LHR → MXP · direct",
        price: 418,
        currency: "GBP",
        source: "amadeus-mock",
        status: "pending_approval",
        expiresAt: "2026-05-01T18:00:00Z",
      },
      {
        id: "offer-lc-2",
        route: "LGW → BGY · then train",
        price: 312,
        currency: "GBP",
        source: "held",
        status: "pending_approval",
        expiresAt: "2026-04-28T12:00:00Z",
      },
    ],
    itineraryDays: [
      {
        id: "d1",
        dateLabel: "Wed 11 Jun",
        notes: "Arrival & positioning",
        segments: [
          { kind: "flight", id: "s1", label: "LHR → MXP", detail: "BA · 07:40 → 10:55 · held" },
          { kind: "flight", id: "s2", label: "MXP → FLR", detail: "ITA · 14:20 → 15:05" },
          { kind: "hotel", id: "s3", label: "Borgo San Felice", detail: "Check-in · week block starts" },
        ],
      },
      {
        id: "d2",
        dateLabel: "Thu 12 Jun",
        notes: "Scout & rehearsal",
        segments: [
          { kind: "ground", id: "s4", label: "Van · Florence ↔ venue", detail: "Sixt hold" },
          { kind: "ground", id: "s5", label: "Planner transfer", detail: "Rehearsal evening · Elena Rossi" },
        ],
      },
      {
        id: "d3",
        dateLabel: "Sat 14 Jun",
        notes: "Wedding day",
        segments: [
          { kind: "ground", id: "s6", label: "Morning prep", detail: "On-property" },
          { kind: "hotel", id: "s7", label: "Vendor meals", detail: "Confirmed with planner" },
        ],
      },
    ],
  },
  santorini: {
    flights: [
      {
        id: "f1",
        route: "LGW → JTR",
        depart: "Thu 3 Jul · 06:15",
        arrive: "Thu 3 Jul · 12:40",
        airline: "easyJet",
        status: "Watchlist (demo)",
      },
    ],
    hotels: [
      {
        id: "h1",
        name: "Grace Hotel Santorini",
        checkIn: "Thu 3 Jul",
        checkOut: "Mon 7 Jul",
        note: "Cliff suite · sunset slot TBC",
      },
    ],
    ground: [
      {
        id: "g1",
        label: "ATV / small car",
        detail: "Local vendor · 4 Jul–6 Jul",
      },
    ],
    flightOffers: [
      {
        id: "offer-s-1",
        route: "LHR → JTR · one stop ATH",
        price: 285,
        currency: "GBP",
        source: "amadeus-mock",
        status: "pending_approval",
        expiresAt: "2026-05-15T09:00:00Z",
      },
    ],
    itineraryDays: [
      {
        id: "sd1",
        dateLabel: "Thu 3 Jul",
        segments: [
          { kind: "flight", id: "ss1", label: "LGW → JTR", detail: "easyJet · 06:15 → 12:40" },
          { kind: "hotel", id: "ss2", label: "Grace Hotel", detail: "Check-in" },
        ],
      },
      {
        id: "sd2",
        dateLabel: "Sat 5 Jul",
        notes: "Ceremony + reception",
        segments: [
          { kind: "ground", id: "ss3", label: "Cliff venue", detail: "Shuttle from hotel (TBC)" },
        ],
      },
    ],
  },
  london: {
    flights: [],
    hotels: [
      {
        id: "h1",
        name: "Claridge's · prep hold",
        checkIn: "Fri 19 Sep",
        checkOut: "Sun 21 Sep",
        note: "Subject to contract — planner hold",
      },
    ],
    ground: [
      {
        id: "g1",
        label: "Black car",
        detail: "Mayfair ↔ venues · day-of only (demo)",
      },
    ],
    flightOffers: [],
    itineraryDays: [
      {
        id: "ld1",
        dateLabel: "Fri 19 Sep",
        segments: [{ kind: "hotel", id: "ls1", label: "Claridge's", detail: "Prep hold · check-in" }],
      },
      {
        id: "ld2",
        dateLabel: "Sat 20 Sep",
        notes: "Wedding day (TBC)",
        segments: [
          { kind: "ground", id: "ls2", label: "Black car", detail: "Mayfair ↔ venues" },
        ],
      },
    ],
  },
};

export function getTravelForWedding(id: string): WeddingTravelPlan | null {
  const plan = WEDDING_TRAVEL[id as WeddingId];
  return plan ?? null;
}
