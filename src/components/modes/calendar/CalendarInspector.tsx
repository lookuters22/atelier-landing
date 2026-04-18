import { useMemo } from "react";
import { isSameDay, isSameWeek, isSameMonth, format } from "date-fns";
import { ChevronLeft, Copy, Link2, Mail, MapPin, Pencil, Plane, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useCalendarMode,
  WEDDING_OPTIONS,
  EVENT_COLORS,
  type CalEvent,
} from "./CalendarModeContext";
import type { BookingLink } from "../../../data/bookingLinks";
import { EventForm } from "./EventForm";
import {
  PaneInspectorEmptyState,
  PaneInspectorFrame,
  PaneInspectorScrollBody,
  PaneInspectorSectionTitle,
  PANE_INSPECTOR_ACCENT_LINK,
  PANE_INSPECTOR_IDLE_LIST_CARD,
  PANE_INSPECTOR_SECONDARY,
  PANE_INSPECTOR_TITLE,
} from "@/components/panes";

const PREP_NOTES: Record<string, { storySoFar: string; myNotes: string }> = {
  "lake-como": {
    storySoFar:
      "Sofia and Marco met at university in Milan. They want a Tuscan villa wedding with golden-hour portraits and candid storytelling throughout.",
    myNotes:
      "Couple prefers film-style edits. Bring 85mm f/1.4 for ceremony. Coordinate drone timing with planner Elena.",
  },
  london: {
    storySoFar:
      "Priya and Daniel are based in London. Intimate ceremony followed by a Claridge's ballroom reception.",
    myNotes:
      "Priya mentioned wanting heritage-inspired details. Confirm henna artist timeline before day-of.",
  },
  santorini: {
    storySoFar:
      "Amelia and James chose Santorini for the cliff-top sunset ceremony. Keeping it under 60 guests.",
    myNotes: "Scout caldera viewpoint the day before. Golden-hour window is 19:20–19:50 in July.",
  },
};

export function CalendarInspector() {
  const { inspectorMode } = useCalendarMode();

  switch (inspectorMode.kind) {
    case "view-event":
      return <EventViewer key={inspectorMode.event.id} event={inspectorMode.event} />;
    case "view-booking":
      return <BookingViewer key={inspectorMode.link.id} link={inspectorMode.link} />;
    case "new-event":
      return <EventForm key={"new-" + inspectorMode.prefillDate + (inspectorMode.prefillTime ?? "")} mode="new" prefillDate={inspectorMode.prefillDate} prefillTime={inspectorMode.prefillTime} />;
    case "edit-event":
      return <EventForm key={"edit-" + inspectorMode.event.id} mode="edit" event={inspectorMode.event} />;
    default:
      return <IdleInspector />;
  }
}

function IdleInspector() {
  const { activeNav } = useCalendarMode();

  if (activeNav === "booking-links") {
    return (
      <IdleShell
        icon={<Link2 className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
        message="Select a booking template to view its configuration, or copy its share link."
      />
    );
  }

  if (activeNav === "travel") {
    return (
      <IdleShell
        icon={<Plane className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
        message="Select a travel block to view logistical details."
      />
    );
  }

  return <ScheduleAgenda />;
}

function IdleShell({ icon, message }: { icon: React.ReactNode; message: string }) {
  return <PaneInspectorEmptyState icon={icon} message={message} />;
}

function ScheduleAgenda() {
  const { visibleEvents, calendarView, selectedDate, viewEvent } = useCalendarMode();
  const anchor = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);

  const { title, subtitle, emptyMsg, filtered } = useMemo(() => {
    let t: string;
    let sub: string;
    let empty: string;
    let items: CalEvent[];

    if (calendarView === "day") {
      t = "Schedule for " + format(anchor, "EEE d MMM");
      sub = format(anchor, "EEEE, d MMMM yyyy");
      empty = "No events on this day.";
      items = visibleEvents.filter((e) => isSameDay(new Date(e.dateISO + "T12:00:00"), anchor));
    } else if (calendarView === "week") {
      t = "This Week";
      const ws = new Date(anchor);
      ws.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      sub = format(ws, "d MMM") + " – " + format(we, "d MMM yyyy");
      empty = "No events this week.";
      items = visibleEvents.filter((e) =>
        isSameWeek(new Date(e.dateISO + "T12:00:00"), anchor, { weekStartsOn: 1 }),
      );
    } else {
      t = "This Month";
      sub = format(anchor, "MMMM yyyy");
      empty = "No events this month.";
      items = visibleEvents.filter((e) =>
        isSameMonth(new Date(e.dateISO + "T12:00:00"), anchor),
      );
    }

    items.sort((a, b) =>
      a.dateISO.localeCompare(b.dateISO) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    );

    return { title: t, subtitle: sub, emptyMsg: empty, filtered: items };
  }, [calendarView, anchor, visibleEvents]);

  return (
    <PaneInspectorFrame>
      <div className="shrink-0 px-4 pt-4 pb-5">
        <PaneInspectorSectionTitle className="mb-1">{title}</PaneInspectorSectionTitle>
        <p className={PANE_INSPECTOR_SECONDARY}>{subtitle}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <p className={cn(PANE_INSPECTOR_SECONDARY, "px-1 py-8 text-center")}>{emptyMsg}</p>
        ) : (
          filtered.map((ev) => (
            <AgendaCard key={ev.id} event={ev} showDate={calendarView !== "day"} onClick={() => viewEvent(ev)} />
          ))
        )}
      </div>
    </PaneInspectorFrame>
  );
}

function AgendaCard({ event, showDate, onClick }: { event: CalEvent; showDate: boolean; onClick: () => void }) {
  const dateObj = new Date(event.dateISO + "T12:00:00");
  const dayLabel = format(dateObj, "EEE d MMM");
  const dot = EVENT_COLORS[event.type].dot;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PANE_INSPECTOR_IDLE_LIST_CARD,
        "flex w-full items-start gap-3 text-left transition-colors hover:bg-muted/20 dark:hover:bg-white/[0.06]",
      )}
    >
      <div className="mt-0.5">
        <span className={`block h-2 w-2 rounded-full ${dot}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight text-foreground">{event.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {showDate && <span>{dayLabel}</span>}
          {event.startTime && (
            <>
              {showDate && <span className="text-border">·</span>}
              <span>
                {event.startTime}
                {event.endTime ? ` – ${event.endTime}` : ""}
              </span>
            </>
          )}
        </div>
      </div>
      <span className="shrink-0 rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
        {event.type}
      </span>
    </button>
  );
}

function EventViewer({ event }: { event: CalEvent }) {
  const { openEditEvent, closeInspector, weddingLinkBase } = useCalendarMode();
  const couple = WEDDING_OPTIONS.find((o) => o.value === event.weddingId);
  const prep = event.weddingId ? PREP_NOTES[event.weddingId] : null;
  const dot = EVENT_COLORS[event.type].dot;

  return (
    <PaneInspectorFrame>
      <div className="shrink-0 flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          type="button"
          onClick={closeInspector}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <h2 className={cn("min-w-0 flex-1 truncate", PANE_INSPECTOR_TITLE)}>{event.title}</h2>
        <button
          type="button"
          onClick={() => openEditEvent(event)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <PaneInspectorScrollBody>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <span className="capitalize text-muted-foreground">{event.type}</span>
          </div>

          <p className={PANE_INSPECTOR_SECONDARY}>
            {event.dateISO}
            {event.startTime ? ` · ${event.startTime}` : ""}
            {event.endTime ? ` – ${event.endTime}` : ""}
          </p>

          {event.location && (
            <div className={cn("flex items-center gap-1.5", PANE_INSPECTOR_SECONDARY)}>
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {event.location}
            </div>
          )}

          {event.sub && <p className={PANE_INSPECTOR_SECONDARY}>{event.sub}</p>}
        </div>

        {couple && couple.value && (
          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <PaneInspectorSectionTitle className="mb-0">Linked Wedding</PaneInspectorSectionTitle>
            <Link to={`${weddingLinkBase}/${couple.value}`} className={cn("mt-1 block font-medium", PANE_INSPECTOR_ACCENT_LINK)}>
              {couple.label}
            </Link>
          </div>
        )}

        {prep && (
          <div className="space-y-3">
            <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
              <PaneInspectorSectionTitle className="mb-0">Story So Far</PaneInspectorSectionTitle>
              <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">{prep.storySoFar}</p>
            </div>
            <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
              <PaneInspectorSectionTitle className="mb-0">My Notes</PaneInspectorSectionTitle>
              <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">{prep.myNotes}</p>
            </div>
          </div>
        )}
      </PaneInspectorScrollBody>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex gap-2">
          {event.meetUrl && (
            <a
              href={event.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#2563eb]/90"
            >
              <Video className="h-3.5 w-3.5" strokeWidth={2} />
              Join Call
            </a>
          )}
          <button
            type="button"
            onClick={() => openEditEvent(event)}
            className="rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground transition hover:bg-accent"
          >
            Reschedule
          </button>
        </div>
      </div>
    </PaneInspectorFrame>
  );
}

function BookingViewer({ link }: { link: BookingLink }) {
  const { closeInspector } = useCalendarMode();

  const copyUrl = () => {
    navigator.clipboard.writeText(link.url).catch(() => {});
  };

  return (
    <PaneInspectorFrame>
      <PaneInspectorScrollBody>
        <div>
          <h2 className={PANE_INSPECTOR_TITLE}>{link.title}</h2>
          <p className={cn("mt-1", PANE_INSPECTOR_SECONDARY)}>{link.description}</p>
        </div>

        <div className="space-y-3">
          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <PaneInspectorSectionTitle className="mb-0">Configuration</PaneInspectorSectionTitle>
            <div className="mt-2 space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium text-foreground">{link.duration} minutes</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Buffer before</span>
                <span className="font-medium text-foreground">{link.bufferBefore}m</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Buffer after</span>
                <span className="font-medium text-foreground">{link.bufferAfter}m</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <span className={cn("font-medium", link.active ? "text-emerald-600" : "text-muted-foreground")}>
                  {link.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>

          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <PaneInspectorSectionTitle className="mb-0">Booking URL</PaneInspectorSectionTitle>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={link.url}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground"
              />
              <button
                type="button"
                onClick={copyUrl}
                className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                title="Copy link"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      </PaneInspectorScrollBody>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#2563eb]/90"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            Copy Link
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground transition hover:bg-accent"
          >
            <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
            Have AI Email Client
          </button>
          <button
            type="button"
            onClick={closeInspector}
            className="ml-auto rounded-lg px-3 py-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </PaneInspectorFrame>
  );
}
