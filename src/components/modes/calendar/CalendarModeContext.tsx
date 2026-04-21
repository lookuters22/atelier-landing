import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { getPhotographerIdForWedding } from "../../../data/managerPhotographers";
import type { BookingLink } from "../../../data/bookingLinks";

const STORAGE_KEY = "atelier-calendar-events";

export type EventType = "shoot" | "consult" | "travel" | "block";

export const EVENT_COLORS: Record<EventType, { bg: string; text: string; dot: string; border: string }> = {
  shoot:   { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-500",  border: "border-indigo-200" },
  consult: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    border: "border-blue-200" },
  travel:  { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-200" },
  block:   { bg: "bg-slate-100",  text: "text-slate-700",   dot: "bg-slate-400",   border: "border-slate-200" },
};

/** @deprecated Use EVENT_COLORS[type].bg + .text + .border instead */
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  shoot:   "bg-indigo-50 border-indigo-200 text-indigo-700",
  consult: "bg-blue-50 border-blue-200 text-blue-700",
  travel:  "bg-emerald-50 border-emerald-200 text-emerald-700",
  block:   "bg-slate-100 border-slate-200 text-slate-700",
};

/** @deprecated Use EVENT_COLORS[type].dot instead */
export const EVENT_TYPE_DOTS: Record<EventType, string> = {
  shoot:   "bg-indigo-500",
  consult: "bg-blue-500",
  travel:  "bg-emerald-500",
  block:   "bg-slate-400",
};

export type CalEvent = {
  id: string;
  dateISO: string;
  title: string;
  sub: string;
  weddingId?: string;
  type: EventType;
  startTime?: string;
  endTime?: string;
  location?: string;
  meetUrl?: string;
};

const SEED_EVENTS: CalEvent[] = [
  {
    id: "seed-1",
    dateISO: "2026-03-28",
    title: "Consultation · Priya & Daniel",
    sub: "Claridge's · video call",
    weddingId: "london",
    type: "consult",
    startTime: "10:00",
    endTime: "10:30",
    meetUrl: "https://meet.google.com/abc-defg-hij",
  },
  {
    id: "seed-2",
    dateISO: "2026-06-11",
    title: "Travel · Sofia & Marco",
    sub: "Milan · Tuscany",
    weddingId: "lake-como",
    type: "travel",
    startTime: "07:40",
    endTime: "15:05",
  },
  {
    id: "seed-3",
    dateISO: "2026-06-14",
    title: "Wedding day · Sofia & Marco",
    sub: "Villa Cetinale · full coverage",
    weddingId: "lake-como",
    type: "shoot",
    startTime: "08:00",
    endTime: "23:00",
    location: "Villa Cetinale, Tuscany",
  },
  {
    id: "seed-4",
    dateISO: "2026-07-03",
    title: "Rehearsal · Amelia & James",
    sub: "Grace Hotel",
    weddingId: "santorini",
    type: "consult",
    startTime: "17:00",
    endTime: "18:00",
    location: "Grace Hotel Santorini",
  },
  {
    id: "seed-5",
    dateISO: "2026-04-15",
    title: "Editing block",
    sub: "Lake Como album post-processing",
    weddingId: "lake-como",
    type: "block",
    startTime: "09:00",
    endTime: "17:00",
  },
  {
    id: "seed-6",
    dateISO: "2026-03-28",
    title: "Engagement shoot · Priya & Daniel",
    sub: "Hyde Park golden hour",
    weddingId: "london",
    type: "shoot",
    startTime: "15:00",
    endTime: "17:30",
    location: "Hyde Park, London",
  },
  {
    id: "seed-7",
    dateISO: "2026-04-15",
    title: "Consultation · Amelia & James",
    sub: "Santorini timeline review",
    weddingId: "santorini",
    type: "consult",
    startTime: "11:00",
    endTime: "11:45",
    meetUrl: "https://meet.google.com/xyz-uvwx-abc",
  },
  {
    id: "seed-8",
    dateISO: "2026-06-14",
    title: "Travel · Villa Cetinale return",
    sub: "Tuscany → Milan",
    weddingId: "lake-como",
    type: "travel",
    startTime: "19:00",
    endTime: "22:00",
  },
];

export function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthYear(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(d);
}

export function buildCalendarCells(year: number, month: number): { d: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const dim = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: { d: Date; inMonth: boolean }[] = [];
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = 0; i < startPad; i++) {
    const day = prevLast - startPad + i + 1;
    cells.push({ d: new Date(year, month - 1, day), inMonth: false });
  }
  for (let day = 1; day <= dim; day++) {
    cells.push({ d: new Date(year, month, day), inMonth: true });
  }
  let trail = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ d: new Date(year, month + 1, trail), inMonth: false });
    trail++;
  }
  while (cells.length < 42) {
    cells.push({ d: new Date(year, month + 1, trail), inMonth: false });
    trail++;
  }
  return cells;
}

export const WEDDING_OPTIONS = [
  { value: "", label: "None" },
  { value: "lake-como", label: "Sofia & Marco" },
  { value: "london", label: "Priya & Daniel" },
  { value: "santorini", label: "Amelia & James" },
];

export type CalendarNav = "schedule" | "booking-links" | "travel";
export type CalendarView = "month" | "week" | "day";

export type InspectorMode =
  | { kind: "idle" }
  | { kind: "view-event"; event: CalEvent }
  | { kind: "view-booking"; link: BookingLink }
  | { kind: "new-event"; prefillDate: string; prefillTime?: string }
  | { kind: "edit-event"; event: CalEvent };

function eventVisibleForPhotographer(e: CalEvent, filter: string): boolean {
  if (filter === "all") return true;
  if (!e.weddingId) return false;
  return getPhotographerIdForWedding(e.weddingId) === filter;
}

export const ALL_EVENT_TYPES: EventType[] = ["shoot", "consult", "travel", "block"];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  shoot: "Shoots",
  consult: "Consultations",
  travel: "Travel",
  block: "Editing blocks",
};

/**
 * Class prefix for calendar event type styling (chips, wev, inspector).
 * Do not use raw `event.type` as a class — `block` is a Tailwind utility and breaks colored chips.
 */
export function calEventTypeClass(type: EventType): string {
  return `cal-evt-${type}`;
}

export type CalendarModeContextValue = {
  viewDate: Date;
  setViewDate: Dispatch<SetStateAction<Date>>;
  shiftMonth: (delta: number) => void;
  /** Jump to today (aligns selected date + month chrome). */
  goToday: () => void;
  /** Month: shift month. Week: ±7 days. Day: ±1 day. */
  shiftPeriod: (delta: number) => void;

  selectedDate: string;
  selectDate: (iso: string) => void;

  activeNav: CalendarNav;
  setActiveNav: (nav: CalendarNav) => void;
  calendarView: CalendarView;
  setCalendarView: (view: CalendarView) => void;

  events: CalEvent[];
  /** Counts by event type for the left pane (photographer filter only, ignores type toggles). */
  typeCounts: Record<EventType, number>;
  visibleEvents: CalEvent[];
  agendaEvents: CalEvent[];
  eventsByDate: Map<string, CalEvent[]>;
  cells: { d: Date; inMonth: boolean }[];
  todayISO: string;

  activeTypeFilters: Set<EventType>;
  toggleTypeFilter: (type: EventType) => void;

  inspectorMode: InspectorMode;
  setInspectorMode: Dispatch<SetStateAction<InspectorMode>>;
  viewEvent: (ev: CalEvent) => void;
  viewBookingLink: (link: BookingLink) => void;
  openNewEvent: (dateISO?: string, startTime?: string) => void;
  openEditEvent: (ev: CalEvent) => void;
  closeInspector: () => void;

  saveEvent: (ev: Omit<CalEvent, "id">) => void;
  updateEvent: (id: string, ev: Omit<CalEvent, "id">) => void;
  deleteEvent: (id: string) => void;

  filterPhotographerId: "all" | string;
  weddingLinkBase: string;
};

const CalendarModeContext = createContext<CalendarModeContextValue | null>(null);

export type CalendarModeProviderProps = {
  children: ReactNode;
  weddingLinkBase?: string;
  filterPhotographerId?: "all" | string;
};

export function CalendarModeProvider({
  children,
  weddingLinkBase = "/pipeline",
  filterPhotographerId = "all",
}: CalendarModeProviderProps) {
  const [viewDate, setViewDate] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalEvent[]>(SEED_EVENTS);
  const [activeNav, setActiveNavRaw] = useState<CalendarNav>("schedule");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>({ kind: "idle" });
  const [selectedDate, setSelectedDate] = useState(() => toISODateLocal(new Date()));
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<EventType>>(
    () => new Set(ALL_EVENT_TYPES),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CalEvent[];
        if (Array.isArray(parsed) && parsed.length > 0) setEvents(parsed);
      }
    } catch { /* keep seed */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* ignore */ }
  }, [events]);

  const setActiveNav = useCallback((nav: CalendarNav) => {
    setActiveNavRaw(nav);
    setInspectorMode({ kind: "idle" });
  }, []);

  const toggleTypeFilter = useCallback((type: EventType) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const photographerEvents = useMemo(
    () => events.filter((e) => eventVisibleForPhotographer(e, filterPhotographerId)),
    [events, filterPhotographerId],
  );

  const typeCounts = useMemo(() => {
    const c: Record<EventType, number> = { shoot: 0, consult: 0, travel: 0, block: 0 };
    for (const e of photographerEvents) c[e.type]++;
    return c;
  }, [photographerEvents]);

  const visibleEvents = useMemo(
    () => photographerEvents.filter((e) => activeTypeFilters.has(e.type)),
    [photographerEvents, activeTypeFilters],
  );

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const cells = useMemo(() => buildCalendarCells(y, m), [y, m]);
  const monthPrefix = monthKey(viewDate);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visibleEvents) {
      const list = map.get(e.dateISO) ?? [];
      list.push(e);
      map.set(e.dateISO, list);
    }
    return map;
  }, [visibleEvents]);

  const agendaEvents = useMemo(() => {
    return visibleEvents
      .filter((e) => e.dateISO.startsWith(monthPrefix))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.title.localeCompare(b.title));
  }, [visibleEvents, monthPrefix]);

  const viewEvent = useCallback((ev: CalEvent) => {
    setInspectorMode({ kind: "view-event", event: { ...ev } });
  }, []);

  const viewBookingLink = useCallback((link: BookingLink) => {
    setInspectorMode({ kind: "view-booking", link });
  }, []);

  const selectDate = useCallback((iso: string) => {
    setSelectedDate(iso);
    const [y2, m2] = iso.split("-").map(Number);
    if (y2 && m2) {
      setViewDate((prev) => {
        if (prev.getFullYear() === y2 && prev.getMonth() === m2 - 1) return prev;
        return new Date(y2, m2 - 1, 1);
      });
    }
  }, []);

  const openNewEvent = useCallback((dateISO?: string, startTime?: string) => {
    const d = dateISO ?? selectedDate;
    setInspectorMode({ kind: "new-event", prefillDate: d, prefillTime: startTime });
  }, [selectedDate]);

  const openEditEvent = useCallback((ev: CalEvent) => {
    setInspectorMode({ kind: "edit-event", event: ev });
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorMode({ kind: "idle" });
  }, []);

  const saveEvent = useCallback((ev: Omit<CalEvent, "id">) => {
    const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setEvents((prev) => [...prev, { ...ev, id }]);
    setInspectorMode({ kind: "idle" });
  }, []);

  const updateEvent = useCallback((id: string, ev: Omit<CalEvent, "id">) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...ev, id } : e)));
    setInspectorMode({ kind: "idle" });
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setInspectorMode({ kind: "idle" });
  }, []);

  const shiftMonth = useCallback((delta: number) => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }, []);

  const goToday = useCallback(() => {
    const t = new Date();
    setSelectedDate(toISODateLocal(t));
    setViewDate(new Date(t.getFullYear(), t.getMonth(), 1));
  }, []);

  const shiftPeriod = useCallback(
    (delta: number) => {
      if (calendarView === "month") {
        shiftMonth(delta);
        return;
      }
      const anchor = new Date(selectedDate + "T12:00:00");
      const days = calendarView === "week" ? delta * 7 : delta;
      anchor.setDate(anchor.getDate() + days);
      const iso = toISODateLocal(anchor);
      setSelectedDate(iso);
      setViewDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    },
    [calendarView, selectedDate, shiftMonth],
  );

  const todayISO = toISODateLocal(new Date());

  const value: CalendarModeContextValue = useMemo(
    () => ({
      viewDate,
      setViewDate,
      shiftMonth,
      goToday,
      shiftPeriod,
      selectedDate,
      selectDate,
      activeNav,
      setActiveNav,
      calendarView,
      setCalendarView,
      events,
      typeCounts,
      visibleEvents,
      agendaEvents,
      eventsByDate,
      cells,
      todayISO,
      activeTypeFilters,
      toggleTypeFilter,
      inspectorMode,
      setInspectorMode,
      viewEvent,
      viewBookingLink,
      openNewEvent,
      openEditEvent,
      closeInspector,
      saveEvent,
      updateEvent,
      deleteEvent,
      filterPhotographerId,
      weddingLinkBase,
    }),
    [
      viewDate,
      shiftMonth,
      goToday,
      shiftPeriod,
      selectedDate,
      selectDate,
      activeNav,
      setActiveNav,
      calendarView,
      events,
      typeCounts,
      visibleEvents,
      agendaEvents,
      eventsByDate,
      cells,
      todayISO,
      activeTypeFilters,
      toggleTypeFilter,
      inspectorMode,
      viewEvent,
      viewBookingLink,
      openNewEvent,
      openEditEvent,
      closeInspector,
      saveEvent,
      updateEvent,
      deleteEvent,
      filterPhotographerId,
      weddingLinkBase,
    ],
  );

  return <CalendarModeContext.Provider value={value}>{children}</CalendarModeContext.Provider>;
}

export function useCalendarMode(): CalendarModeContextValue {
  const ctx = useContext(CalendarModeContext);
  if (!ctx) throw new Error("useCalendarMode must be used within CalendarModeProvider");
  return ctx;
}
