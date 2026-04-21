import { useMemo } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  calEventTypeClass,
  formatMonthYear,
  toISODateLocal,
  useCalendarMode,
  type CalEvent,
  type CalendarView,
} from "./CalendarModeContext";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

const HOUR_START = 7;
const HOUR_END = 20;
const SLOT_PX = 56;

function timeToMinutes(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

function minutesToTop(mins: number): number {
  return ((mins - HOUR_START * 60) / 60) * SLOT_PX;
}

function eventHeight(ev: CalEvent): number {
  const s = timeToMinutes(ev.startTime);
  if (s === null) return SLOT_PX;
  const e = timeToMinutes(ev.endTime) ?? s + 60;
  return Math.max(((e - s) / 60) * SLOT_PX, 24);
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function chipClass(type: EventType): string {
  return type;
}

function wevClass(type: EventType): string {
  return type;
}

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
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export function CalendarScheduleGrid() {
  const {
    calendarView,
    setCalendarView,
    viewDate,
    shiftPeriod,
    goToday,
    openNewEvent,
    selectedDate,
    todayISO,
  } = useCalendarMode();

  const selectedAnchor = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);

  const todayLabel = useMemo(() => {
    const line = format(selectedAnchor, "EEE, d MMMM");
    return selectedDate === todayISO ? `${line} · today` : line;
  }, [selectedAnchor, selectedDate, todayISO]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="cal-toolbar shrink-0 flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border-default)] bg-[var(--surface-canvas)] px-[18px] pb-2.5 pt-3">
        <div className="cal-title min-w-0 shrink">
          <h1 className="text-[19px] font-medium leading-tight tracking-[-0.5px] text-[var(--fg-1)]">
            {formatMonthYear(viewDate)}
          </h1>
          <span className="today-label whitespace-nowrap font-[family-name:var(--font-serif)] text-[12px] italic tracking-[-0.1px] text-[var(--fg-3)]">
            {todayLabel}
          </span>
        </div>
        <div className="cal-tb-right flex shrink-0 flex-wrap items-center gap-1.5">
          <button type="button" className="cal-today-btn" onClick={goToday}>
            Today
          </button>
          <button
            type="button"
            className="cal-nav-arrow"
            aria-label="Previous"
            onClick={() => shiftPeriod(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="cal-nav-arrow"
            aria-label="Next"
            onClick={() => shiftPeriod(1)}
          >
            <ChevronRight />
          </button>
          <div className="view-toggle">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                data-active={calendarView === v.key}
                onClick={() => setCalendarView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button type="button" className="cal-add-btn" onClick={() => openNewEvent()}>
            <PlusIcon />
            Event
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {calendarView === "month" && <MonthGrid />}
        {calendarView === "week" && <WeekView />}
        {calendarView === "day" && <DayView />}
      </div>
    </div>
  );
}

function MonthGrid() {
  const { cells, eventsByDate, todayISO, selectedDate, selectDate, openNewEvent, viewEvent } =
    useCalendarMode();

  return (
    <div className="month-grid-wrap flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="month-dow grid shrink-0 grid-cols-7 border-b border-[var(--border-default)] bg-[var(--surface-canvas)] pb-1.5 pt-2">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-grid grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map(({ d, inMonth }, idx) => {
          const iso = toISODateLocal(d);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isToday = inMonth && iso === todayISO;
          const isSelected = inMonth && iso === selectedDate;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const show = dayEvents.slice(0, 3);
          const more = dayEvents.length - show.length;
          const wk = (() => {
            const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const dayNum = t.getUTCDay() || 7;
            t.setUTCDate(t.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
            return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
          })();
          const isMon = d.getDay() === 1;

          return (
            <div
              key={`${iso}-${idx}`}
              role="gridcell"
              className={cn(
                "mcell",
                !inMonth && "out",
                inMonth && isWeekend && "weekend",
                isToday && "today",
                isSelected && "sel",
              )}
              onClick={() => inMonth && selectDate(iso)}
              onDoubleClick={() => inMonth && openNewEvent(iso)}
            >
              {inMonth && isMon && (
                <span className="wknum absolute left-1 top-1.5 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.6px] text-[var(--fg-5)]">
                  W{wk}
                </span>
              )}
              <span className="dnum">{d.getDate()}</span>
              {show.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className={cn("chip", calEventTypeClass(ev.type))}
                  title={ev.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    viewEvent(ev);
                  }}
                >
                  <span className="t">{ev.startTime ?? "—"}</span>
                  {ev.title}
                </button>
              ))}
              {more > 0 && (
                <button type="button" className="more" onClick={(e) => e.stopPropagation()}>
                  +{more} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function daySummary(iso: string, todayISO: string, count: number): string {
  if (iso === todayISO) return "today";
  if (count === 0) return "quiet";
  return `${count} event${count === 1 ? "" : "s"}`;
}

function WeekView() {
  const {
    visibleEvents,
    todayISO,
    selectedDate,
    selectDate,
    openNewEvent,
    viewEvent,
  } = useCalendarMode();

  const anchor = new Date(selectedDate + "T12:00:00");
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => i + HOUR_START);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine =
    days.some((d) => toISODateLocal(d) === todayISO) &&
    nowMin >= HOUR_START * 60 &&
    nowMin <= HOUR_END * 60 + 59;

  return (
    <div className="week-wrap flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="week-head grid shrink-0 grid-cols-[42px_repeat(7,1fr)] border-b border-[var(--border-default)] bg-[var(--surface-canvas)]">
        <div className="tz-col border-r border-[var(--border-default)]" />
        {days.map((d) => {
          const iso = toISODateLocal(d);
          const isToday = iso === todayISO;
          const isSel = iso === selectedDate;
          const count = visibleEvents.filter((e) => e.dateISO === iso).length;
          const dow = WEEKDAYS[(d.getDay() + 6) % 7];
          return (
            <button
              key={iso}
              type="button"
              className={cn(
                "wdaycell border-r border-[var(--border-default)] text-left last:border-r-0",
                isToday && "today",
                isSel && "sel",
              )}
              onClick={() => selectDate(iso)}
            >
              <span className="dow-lbl">{dow}</span>
              <span className="dnum">{d.getDate()}</span>
              <span className="sub">{daySummary(iso, todayISO, count)}</span>
            </button>
          );
        })}
      </div>

      <div
        className="week-body relative grid grid-cols-[42px_repeat(7,1fr)]"
        style={{ minHeight: hours.length * SLOT_PX }}
      >
        <div className="hour-col flex flex-col border-r border-[var(--border-default)]">
          {hours.map((h) => (
            <div key={h} className="hr">
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const iso = toISODateLocal(d);
          const colEvents = visibleEvents.filter((e) => e.dateISO === iso && e.startTime);
          const isToday = iso === todayISO;
          const isSel = iso === selectedDate;

          return (
            <div
              key={iso}
              role="presentation"
              className={cn(
                "week-day-col relative cursor-pointer border-r border-[var(--border-default)] last:border-r-0",
                isToday && "today",
                isSel && "sel",
              )}
              style={{ minHeight: hours.length * SLOT_PX }}
              onClick={() => selectDate(iso)}
              onDoubleClick={() => openNewEvent(iso)}
            >
              {hours.map((h) => (
                <div key={h} className="hr-slot" />
              ))}

              {colEvents.map((ev) => {
                const s = timeToMinutes(ev.startTime);
                if (s === null) return null;
                const top = minutesToTop(s);
                const h = eventHeight(ev);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={cn("wev", calEventTypeClass(ev.type))}
                    style={{ top, height: h }}
                    onClick={(e) => {
                      e.stopPropagation();
                      viewEvent(ev);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <span className="wev-t">
                      {ev.startTime}
                      {ev.endTime ? ` – ${ev.endTime}` : ""}
                    </span>
                    <span className="wev-ti">{ev.title}</span>
                  </button>
                );
              })}

              {showNowLine && isToday && (
                <div
                  className="now-line pointer-events-none"
                  style={{ top: minutesToTop(nowMin) }}
                  aria-hidden
                >
                  <span className="tag">
                    {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView() {
  const { selectedDate, visibleEvents, viewEvent, openNewEvent } = useCalendarMode();
  const anchor = new Date(selectedDate + "T12:00:00");
  const iso = selectedDate;
  const dayEvents = useMemo(
    () =>
      visibleEvents
        .filter((e) => e.dateISO === iso)
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
    [visibleEvents, iso],
  );

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = iso === toISODateLocal(now);

  const heading = format(anchor, "EEEE, d MMMM");
  const belgradeClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <div className="day-view-root mx-auto w-full max-w-[760px] flex-1 overflow-y-auto px-10 pb-24 pt-6">
      <div className="mb-3.5 flex items-baseline justify-between">
        <h2 className="text-[28px] font-medium tracking-[-0.6px] text-[var(--fg-1)]">{heading}</h2>
        <span className="font-[family-name:var(--font-serif)] text-[14px] italic text-[var(--fg-3)]">
          Belgrade · {belgradeClock}
        </span>
      </div>

      <div className="day-timeline flex flex-col gap-1.5">
        {dayEvents.map((ev) => {
          const s = timeToMinutes(ev.startTime);
          const past = s !== null && s < nowMin - 30 && isToday;
          const current =
            isToday &&
            s !== null &&
            (() => {
              const e = timeToMinutes(ev.endTime) ?? s + 60;
              return nowMin >= s && nowMin < e;
            })();

          return (
            <button
              key={ev.id}
              type="button"
              className={cn("tl-row text-left", past && "past")}
              onClick={() => viewEvent(ev)}
            >
              <div className="time">{ev.startTime ?? "—"}</div>
              <div className={cn("ev", calEventTypeClass(ev.type), current && "ev-current")}>
                <div className="ti">{ev.title}</div>
                {ev.sub && <div className="loc">{ev.sub}</div>}
                <div className="dur">
                  {ev.startTime}
                  {ev.endTime ? ` – ${ev.endTime}` : ""}
                  {ev.location && ` · ${ev.location}`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="mt-6 rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-[12px] text-[var(--fg-3)] hover:bg-[oklab(0.145_0_0/0.04)]"
        onClick={() => openNewEvent(iso)}
      >
        Add event…
      </button>
    </div>
  );
}
