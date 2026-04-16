import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar, CalendarDayButton } from "../../ui/calendar";
import {
  useCalendarMode,
  EVENT_COLORS,
  ALL_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  toISODateLocal,
  type EventType,
} from "./CalendarModeContext";
import type { DayButton } from "react-day-picker";

const MAX_DOTS = 3;

/* ------------------------------------------------------------------ */
/*  Mini-calendar dot rendering                                       */
/* ------------------------------------------------------------------ */

const DotMapCtx = createContext<Map<string, EventType[]>>(new Map());

function DayButtonWithDots(props: React.ComponentProps<typeof DayButton>) {
  const dotMap = useContext(DotMapCtx);
  const iso = toISODateLocal(props.day.date);
  const types = dotMap.get(iso);

  return (
    <CalendarDayButton {...props}>
      {props.children}
      <div className="flex h-1.5 items-center justify-center gap-0.5">
        {types
          ? types.slice(0, MAX_DOTS).map((t, i) => (
              <span key={i} className={cn("h-1 w-1 rounded-full", EVENT_COLORS[t].dot)} />
            ))
          : <span className="h-1 w-1 rounded-full bg-transparent" />}
      </div>
    </CalendarDayButton>
  );
}

/* ------------------------------------------------------------------ */
/*  Timezone clock (live, updates every minute)                       */
/* ------------------------------------------------------------------ */

const TZ_LIST = [
  { city: "Local", tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { city: "London", tz: "Europe/London" },
  { city: "New York", tz: "America/New_York" },
];

function useClockMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTzTime(now: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false }).format(now);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function CalendarContextList() {
  const {
    viewDate, setViewDate, selectedDate, selectDate,
    todayISO, visibleEvents,
    activeTypeFilters, toggleTypeFilter,
  } = useCalendarMode();

  const selectedDateObj = new Date(selectedDate + "T12:00:00");
  const now = useClockMinute();

  const { eventDates, dotMap } = useMemo(() => {
    const dates: Date[] = [];
    const map = new Map<string, EventType[]>();
    for (const ev of visibleEvents) {
      const existing = map.get(ev.dateISO);
      if (existing) {
        if (!existing.includes(ev.type)) existing.push(ev.type);
      } else {
        map.set(ev.dateISO, [ev.type]);
        dates.push(new Date(ev.dateISO + "T12:00:00"));
      }
    }
    return { eventDates: dates, dotMap: map };
  }, [visibleEvents]);

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    selectDate(toISODateLocal(day));
  };

  return (
    <div className="dashboard-context-pane flex h-full min-h-0 flex-col border-r border-border text-[13px] text-foreground">
      {/* Mini calendar */}
      <div className="shrink-0 px-1 py-2 mb-4">
        <DotMapCtx.Provider value={dotMap}>
          <Calendar
            mode="single"
            selected={selectedDateObj}
            onSelect={handleDaySelect}
            month={viewDate}
            onMonthChange={(m) => setViewDate(m)}
            modifiers={{
              today: new Date(todayISO + "T12:00:00"),
              hasEvent: eventDates,
            }}
            components={{ DayButton: DayButtonWithDots }}
            className="w-full bg-transparent [--cell-size:--spacing(7)]"
          />
        </DotMapCtx.Provider>
      </div>

      {/* Scrollable area below */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* Event type filters */}
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Event Types
        </p>
        <div className="space-y-0.5">
          {ALL_EVENT_TYPES.map((type) => {
            const active = activeTypeFilters.has(type);
            const c = EVENT_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleTypeFilter(type)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                  "hover:bg-slate-100 cursor-pointer",
                )}
              >
                {/* Custom toggle dot */}
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full border transition-colors",
                    active
                      ? `${c.dot} border-transparent`
                      : "border-slate-300 bg-transparent",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[13px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground line-through",
                  )}
                >
                  {EVENT_TYPE_LABELS[type]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timezones */}
        <div className="mt-6" />
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Timezones
        </p>
        <div className="space-y-0.5">
          {TZ_LIST.map((tz) => (
            <div
              key={tz.city}
              className="flex items-center justify-between rounded-md px-2 py-1.5"
            >
              <span className="tabular-nums text-[13px] text-slate-600">
                {formatTzTime(now, tz.tz)}
              </span>
              <span className="text-[12px] text-muted-foreground">{tz.city}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
