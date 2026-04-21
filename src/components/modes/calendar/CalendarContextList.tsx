import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getPhotographerIdForWedding } from "../../../data/managerPhotographers";
import { BOOKING_LINKS } from "../../../data/bookingLinks";
import { WEDDING_TRAVEL } from "../../../data/weddingTravel";
import {
  useCalendarMode,
  ALL_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  toISODateLocal,
  monthKey,
  formatMonthYear,
  type EventType,
  type CalEvent,
  WEDDING_OPTIONS,
} from "./CalendarModeContext";

const MAX_DOTS = 3;

const TZ_ROWS = [
  { city: "Belgrade", tz: "Europe/Belgrade" },
  { city: "London", tz: "Europe/London" },
  { city: "New York", tz: "America/New_York" },
];

const SWATCH: Record<EventType, string> = {
  shoot: "#5d5bd4",
  consult: "#65b5ff",
  travel: "#0bdf50",
  block: "#9c9fa5",
};

/** Weekday row — single-letter labels (compact), Mon–Sun; matches redesign density */
const MINI_DOW = ["M", "T", "W", "T", "F", "S", "S"];

function useClockMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTzTime(now: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hour12: false,
  }).format(now);
}

function eventPhotoVisible(e: CalEvent, filterPhotographerId: "all" | string): boolean {
  if (filterPhotographerId === "all") return true;
  if (!e.weddingId) return false;
  return getPhotographerIdForWedding(e.weddingId) === filterPhotographerId;
}

function travelWorkspaceCount(): number {
  let n = 0;
  for (const opt of WEDDING_OPTIONS) {
    if (!opt.value) continue;
    if (WEDDING_TRAVEL[opt.value as keyof typeof WEDDING_TRAVEL]) n++;
  }
  return n;
}

const NavScheduleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <rect x="3.5" y="5" width="17" height="15" rx="1" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const NavBookingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l1-1" />
  </svg>
);
const NavTravelIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export function CalendarContextList() {
  const {
    viewDate,
    shiftMonth,
    selectedDate,
    selectDate,
    todayISO,
    visibleEvents,
    activeTypeFilters,
    toggleTypeFilter,
    typeCounts,
    activeNav,
    setActiveNav,
    events,
    filterPhotographerId,
    cells,
  } = useCalendarMode();

  const now = useClockMinute();

  const dotMap = useMemo(() => {
    const map = new Map<string, EventType[]>();
    for (const ev of visibleEvents) {
      const existing = map.get(ev.dateISO);
      if (existing) {
        if (!existing.includes(ev.type)) existing.push(ev.type);
      } else {
        map.set(ev.dateISO, [ev.type]);
      }
    }
    return map;
  }, [visibleEvents]);

  const scheduleNavCount = useMemo(() => {
    const prefix = monthKey(viewDate);
    return events.filter(
      (e) => eventPhotoVisible(e, filterPhotographerId) && e.dateISO.startsWith(prefix),
    ).length;
  }, [events, filterPhotographerId, viewDate]);

  const travelNavCount = travelWorkspaceCount();

  return (
    <aside className="cal-ctx ana-calendar-port flex h-full min-h-0 flex-col">
      <div className="pane-head shrink-0 border-b border-[var(--border-default)] px-4 pb-2.5 pt-3.5">
        <h3 className="text-[17px] font-medium tracking-[-0.4px] text-[var(--fg-1)]">Calendar</h3>
        <p className="sub mt-1 font-[family-name:var(--font-serif)] text-[13px] italic leading-snug text-[var(--fg-3)] tracking-[-0.1px]">
          Ana keeps the hours honest.
        </p>
      </div>

      <div className="cal-ctx-body min-h-0 flex-1 overflow-y-auto px-2.5 pb-10 pt-3.5">
        <div className="mini-cal">
          <div className="mini-cal-head">
            <span className="mm">{formatMonthYear(viewDate)}</span>
            <div className="nav">
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                <ChevronLeft />
              </button>
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
                <ChevronRight />
              </button>
            </div>
          </div>

          <div className="mini-cal-grid" role="grid" aria-label="Mini calendar">
            {MINI_DOW.map((d, i) => (
              <div key={`mini-dow-${i}`} className="dow">
                {d}
              </div>
            ))}
            {cells.map(({ d, inMonth }, idx) => {
              const iso = toISODateLocal(d);
              const types = dotMap.get(iso);
              const isToday = iso === todayISO;
              const isSel = iso === selectedDate;
              return (
                <button
                  key={`${iso}-${idx}`}
                  type="button"
                  role="gridcell"
                  onClick={() => selectDate(iso)}
                  className={cn("d", !inMonth && "out", isToday && "today", isSel && "sel")}
                >
                  <span className="num">{d.getDate()}</span>
                  <span className="dots">
                    {types
                      ? types.slice(0, MAX_DOTS).map((t, dotIdx) => (
                          <i
                            key={dotIdx}
                            style={{
                              background:
                                t === "shoot"
                                  ? "#5d5bd4"
                                  : t === "consult"
                                    ? "#65b5ff"
                                    : t === "travel"
                                      ? "#0bdf50"
                                      : "#9c9fa5",
                            }}
                          />
                        ))
                      : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cal-ctx-section px-1.5 pb-1.5 pt-3.5">
          <div className="cal-ctx-section-label flex items-center justify-between px-1 pb-2">
            <span>Event types</span>
          </div>
          {ALL_EVENT_TYPES.map((type) => {
            const active = activeTypeFilters.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleTypeFilter(type)}
                className={cn("ftype", !active && "off")}
              >
                <span
                  className="swatch border border-transparent"
                  style={{
                    background: active ? SWATCH[type] : "transparent",
                    borderColor: active ? "transparent" : "var(--color-oat, #e5e2dc)",
                    borderStyle: active ? "solid" : "solid",
                  }}
                />
                {EVENT_TYPE_LABELS[type]}
                <span className="n">{typeCounts[type]}</span>
              </button>
            );
          })}
          <button type="button" className="ftype" aria-label="Ana proposals (preview)">
            <span
              className="swatch border border-dashed"
              style={{ background: "var(--color-fin)", borderColor: "var(--color-fin)" }}
            />
            Ana proposals
            <span className="n" style={{ color: "var(--color-fin)" }}>
              3
            </span>
          </button>
        </div>

        <div className="cal-ctx-section px-1.5 pb-1.5 pt-3.5">
          <div className="cal-ctx-section-label px-1 pb-2">Workspaces</div>
          <button
            type="button"
            className="cal-nav-item"
            data-active={activeNav === "schedule"}
            onClick={() => setActiveNav("schedule")}
          >
            <NavScheduleIcon />
            Schedule<span className="n">{scheduleNavCount}</span>
          </button>
          <button
            type="button"
            className="cal-nav-item"
            data-active={activeNav === "booking-links"}
            onClick={() => setActiveNav("booking-links")}
          >
            <NavBookingIcon />
            Booking links<span className="n">{BOOKING_LINKS.length}</span>
          </button>
          <button
            type="button"
            className="cal-nav-item"
            data-active={activeNav === "travel"}
            onClick={() => setActiveNav("travel")}
          >
            <NavTravelIcon />
            Travel blocks<span className="n">{travelNavCount}</span>
          </button>
        </div>

        <div className="cal-ctx-section px-1.5 pb-1.5 pt-3.5">
          <div className="cal-ctx-section-label px-1 pb-2">Timezones</div>
          {TZ_ROWS.map((row) => (
            <div key={row.city} className="tz-row">
              <span className="t">{formatTzTime(now, row.tz)}</span>
              <span className="c">{row.city}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
