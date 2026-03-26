import { useState } from "react";
import { Building2, Car, ChevronDown, Plane, Sparkles } from "lucide-react";
import type { TravelDay, WeddingTravelPlan } from "../data/weddingTravel";

function fmtOfferPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

function SegmentIcon({ kind }: { kind: TravelDay["segments"][0]["kind"] }) {
  if (kind === "flight") return <Plane className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.75} />;
  if (kind === "hotel") return <Building2 className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.75} />;
  return <Car className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.75} />;
}

type OfferOverride = Record<string, "approved" | "rejected">;

export function TravelTabPanel({
  travelPlan,
  onToast,
}: {
  travelPlan: WeddingTravelPlan;
  onToast: (msg: string) => void;
}) {
  const [expandedDay, setExpandedDay] = useState<Record<string, boolean>>({});
  const [offerOverride, setOfferOverride] = useState<OfferOverride>({});

  const offers = travelPlan.flightOffers ?? [];
  const days = travelPlan.itineraryDays ?? [];

  function effectiveOfferStatus(o: (typeof offers)[0]): "pending_approval" | "approved" | "rejected" {
    return offerOverride[o.id] ?? o.status;
  }

  function toggleDay(id: string) {
    setExpandedDay((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  function approveOffer(id: string) {
    setOfferOverride((prev) => ({ ...prev, [id]: "approved" }));
    onToast("Offer approved (demo — no booking created).");
  }

  function dismissOffer(id: string) {
    setOfferOverride((prev) => ({ ...prev, [id]: "rejected" }));
    onToast("Offer dismissed.");
  }

  return (
    <div className="space-y-8">
      {days.length > 0 ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Itinerary</h3>
          <p className="mt-1 text-[12px] text-ink-muted">Day-by-day timeline (demo seed).</p>
          <ul className="mt-3 space-y-2">
            {days.map((day) => {
              const open = expandedDay[day.id] ?? true;
              return (
                <li key={day.id} className="overflow-hidden rounded-xl border border-border bg-canvas/60">
                  <button
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-black/[0.02]"
                  >
                    <ChevronDown className={"h-4 w-4 shrink-0 text-ink-faint transition " + (open ? "" : "-rotate-90")} />
                    <span className="text-[13px] font-semibold text-ink">{day.dateLabel}</span>
                    {day.notes ? <span className="text-[12px] text-ink-faint">· {day.notes}</span> : null}
                  </button>
                  {open ? (
                    <ul className="space-y-1.5 border-t border-border/60 px-3 py-2 pl-10">
                      {day.segments.map((seg) => (
                        <li key={seg.id} className="flex gap-2 text-[13px] text-ink">
                          <span className="mt-0.5 shrink-0">
                            <SegmentIcon kind={seg.kind} />
                          </span>
                          <span>
                            <span className="font-medium">{seg.label}</span>
                            <span className="text-ink-muted"> · {seg.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Suggested offers</h3>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          Logistics agent + Amadeus placeholder. Approve or dismiss — no live booking until API keys and backend are connected.
        </p>
        {offers.length > 0 && offers.every((o) => effectiveOfferStatus(o) !== "pending_approval") ? (
          <p className="mt-2 text-[13px] text-ink-muted">No pending suggestions.</p>
        ) : null}
        {offers.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">No agent offers for this trip (demo).</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {offers.map((o) => {
              const st = effectiveOfferStatus(o);
              if (st !== "pending_approval") {
                return (
                  <li
                    key={o.id}
                    className="rounded-xl border border-border/60 bg-canvas/40 px-3 py-2 text-[12px] text-ink-faint line-through"
                  >
                    {o.route} · {fmtOfferPrice(o.price, o.currency)} · {st === "approved" ? "Approved" : "Dismissed"}
                  </li>
                );
              }
              return (
                <li key={o.id} className="rounded-xl border border-accent/25 bg-accent/[0.04] px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">{o.route}</p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {fmtOfferPrice(o.price, o.currency)} · {o.source === "amadeus-mock" ? "Amadeus mock" : "Held fare"} · expires{" "}
                        {new Date(o.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover"
                        onClick={() => approveOffer(o.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-muted hover:border-accent/40 hover:text-ink"
                        onClick={() => dismissOffer(o.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Confirmed</h3>
        <p className="mt-1 text-[12px] text-ink-muted">Held or logged bookings (same as before).</p>

        <div className="mt-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <Plane className="h-4 w-4" strokeWidth={1.75} />
            Flights
          </div>
          {travelPlan.flights.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-muted">No flights logged yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {travelPlan.flights.map((f) => (
                <li key={f.id} className="rounded-xl border border-border bg-canvas/80 px-3 py-2.5 text-[13px] text-ink">
                  <p className="font-semibold">{f.route}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {f.depart} → {f.arrive} · {f.airline}
                  </p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-accent">{f.status}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
            Hotels
          </div>
          <ul className="mt-2 space-y-2">
            {travelPlan.hotels.map((h) => (
              <li key={h.id} className="rounded-xl border border-border bg-canvas/80 px-3 py-2.5 text-[13px] text-ink">
                <p className="font-semibold">{h.name}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {h.checkIn} – {h.checkOut}
                </p>
                {h.note ? <p className="mt-1 text-[12px] text-ink-faint">{h.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <Car className="h-4 w-4" strokeWidth={1.75} />
            Ground &amp; transfers
          </div>
          <ul className="mt-2 space-y-2">
            {travelPlan.ground.map((g) => (
              <li key={g.id} className="rounded-xl border border-border bg-canvas/80 px-3 py-2.5 text-[13px] text-ink">
                <p className="font-semibold">{g.label}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">{g.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-ink-faint">
        Flight search, holds, and booking sync via Amadeus; itinerary agent orchestration via LangGraph (planned).{" "}
        <code className="rounded bg-ink/5 px-1 py-0.5 text-[10px]">GET /api/travel/offers?weddingId=</code> will populate offers when a backend exists.
      </p>
    </div>
  );
}
