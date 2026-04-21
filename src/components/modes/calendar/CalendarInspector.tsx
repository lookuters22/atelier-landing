import { useMemo } from "react";
import { format } from "date-fns";
import { ChevronLeft, Copy, Link2, Mail, MapPin, Pencil, Plane, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  useCalendarMode,
  WEDDING_OPTIONS,
  EVENT_TYPE_LABELS,
  calEventTypeClass,
  toISODateLocal,
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

function timeToMinutes(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

function ScheduleAgenda() {
  const { visibleEvents, selectedDate, viewEvent, openNewEvent, weddingLinkBase } = useCalendarMode();
  const anchor = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = selectedDate === toISODateLocal(now);

  const dayEvents = useMemo(() => {
    return visibleEvents
      .filter((e) => e.dateISO === selectedDate)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  }, [visibleEvents, selectedDate]);

  const eyebrow = format(anchor, "EEE, d MMMM") + (isToday ? " · today" : "");

  return (
    <aside className="cal-inspector ana-calendar-port flex h-full min-h-0 flex-col">
      <div className="cal-inspector-head shrink-0 border-b border-[var(--border-default)] px-[18px] pb-3 pt-3.5">
        <div className="eyebrow">{eyebrow}</div>
        <h3>Your plate</h3>
        <div className="sub">
          Two things live, one scout to brief, three proposals waiting.
        </div>
      </div>

      <div className="cal-inspector-body flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-4 pb-28 pt-4">
        {/* Ana proposals — hardcoded visual (wire later) */}
        <div>
          <div className="insp-section-head">
            <div className="l">
              <span className="fin-dot-sm" aria-hidden />
              Ana proposed · 3
            </div>
            <button type="button" className="action">
              See all
            </button>
          </div>

          <div className="proposal mb-2.5">
            <div className="p-head">
              <div className="p-who">Sophia &amp; James · Capri</div>
              <span className="p-age">42m ago</span>
            </div>
            <p className="p-body">
              They asked for a call this week. I pulled <b>Thursday 16:00</b> and <b>Friday 10:00</b> — both clear
              either side, and I can move the Friday editing block.
            </p>
            <div className="p-slots">
              <button type="button" className="pslot">
                <span className="when">Thu 23 · 16:00 CET</span>
                <span className="dur">45m</span>
              </button>
              <button type="button" className="pslot">
                <span className="when">Fri 24 · 10:00 CET</span>
                <span className="dur">45m</span>
              </button>
            </div>
            <div className="p-actions">
              <button type="button" className="p-btn primary">
                Offer both
              </button>
              <button type="button" className="p-btn ghost">
                Change
              </button>
              <button type="button" className="p-btn linkish">
                Skip
              </button>
            </div>
          </div>

          <div className="proposal mb-2.5">
            <div className="p-head">
              <div className="p-who">Sofia &amp; Marco · Lake Como</div>
              <span className="p-age">1h ago</span>
            </div>
            <p className="p-body">
              Rehearsal dinner walk-through. I want <b>2 hours</b> in the Villa Cetinale calendar before your June
              trip — safest on Wed morning.
            </p>
            <div className="p-slots">
              <button type="button" className="pslot">
                <span className="when">Wed 22 · 09:00</span>
                <span className="dur">60m call</span>
              </button>
            </div>
            <div className="p-actions">
              <button type="button" className="p-btn primary">
                Schedule
              </button>
              <button type="button" className="p-btn ghost">
                Reschedule
              </button>
            </div>
          </div>

          <div className="paused">
            <div className="p-head">
              <div className="ico" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="6" y="5" width="4" height="14" />
                  <rect x="14" y="5" width="4" height="14" />
                </svg>
              </div>
              <div className="p-who">The Hartwells · Ravello</div>
            </div>
            <p className="p-body">
              Asked for a second-shooter quote — I&apos;m not sure your rate for ceremony-only. Teach me, or handle on
              your side.
            </p>
          </div>
        </div>

        {/* Today — live events for selected day */}
        <div>
          <div className="insp-section-head">
            <div className="l">Today</div>
            <button type="button" className="action" onClick={() => openNewEvent(selectedDate)}>
              Edit day
            </button>
          </div>
          {dayEvents.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-[var(--fg-3)]">Nothing on this day.</p>
          ) : (
            <div className="day-timeline flex flex-col gap-0.5">
              {dayEvents.map((ev) => {
                const s = timeToMinutes(ev.startTime);
                const past = isToday && s !== null && s < nowMin - 25;
                const eEnd = timeToMinutes(ev.endTime) ?? (s !== null ? s + 60 : null);
                const current =
                  isToday && s !== null && eEnd !== null && nowMin >= s && nowMin < eEnd;
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
          )}
        </div>

        {/* Flagged — hardcoded */}
        <div>
          <div className="insp-section-head">
            <div className="l">Flagged</div>
          </div>
          <div className="conflict">
            <b>Wed 22 · 13:00 overlap</b>
            <div className="detail">
              Mara Bennett intro (proposed) lands in the middle of a 4h editing block — I&apos;d push editing to Thu
              10:00 if you accept her slot.
            </div>
          </div>
        </div>

        {/* Story / brief — hardcoded + pipeline link */}
        <div>
          <div className="insp-section-head">
            <div className="l">Story so far · Priya &amp; Daniel</div>
          </div>
          <div className="brief-card">
            <div className="eyebrow">Claridge&apos;s · intimate ceremony</div>
            <p>
              Based in London. Priya mentioned wanting heritage-inspired details. Daniel is quieter on email — she
              leads the thread.
            </p>
            <p className="mt-2 font-[family-name:var(--font-serif)] text-[12.5px] italic leading-relaxed text-[var(--fg-2)]">
              &quot;Confirm henna artist timeline before day-of.&quot; — your note, March 12.
            </p>
            <Link className="open-link" to={`${weddingLinkBase}/london`}>
              Open in Pipeline →
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}

function EventViewer({ event }: { event: CalEvent }) {
  const { openEditEvent, closeInspector, weddingLinkBase } = useCalendarMode();
  const couple = WEDDING_OPTIONS.find((o) => o.value === event.weddingId);
  const prep = event.weddingId ? PREP_NOTES[event.weddingId] : null;

  const anchor = new Date(event.dateISO + "T12:00:00");
  const dateLine = format(anchor, "EEEE, d MMMM yyyy");
  const scheduleLine = event.startTime
    ? `${event.startTime}${event.endTime ? ` – ${event.endTime}` : ""}`
    : "Time TBD";

  return (
    <aside
      className={cn(
        "cal-inspector ana-calendar-port flex h-full min-h-0 flex-col",
        `cal-evt-inspector-${event.type}`,
      )}
    >
      <div
        className={cn(
          "cal-evt-head-row shrink-0 border-b border-[var(--border-default)]",
          `cal-evt-head-${event.type}`,
        )}
      >
        <button type="button" className="cal-evt-back" onClick={closeInspector} aria-label="Back">
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Calendar event</div>
          <h3 className="mt-0.5 break-words">{event.title}</h3>
          <div className="sub mt-1 max-w-[min(100%,42ch)]">
            {dateLine}
            {event.startTime ? ` · ${scheduleLine}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="cal-evt-back"
          onClick={() => openEditEvent(event)}
          aria-label="Edit event"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      <div className="cal-inspector-body flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-4 pb-28 pt-4">
        <div>
          <div className="insp-section-head">
            <div className="l">Type</div>
          </div>
          <span className={cn("chip mt-1 inline-flex max-w-full", calEventTypeClass(event.type))}>
            <span className="t">Type</span>
            {EVENT_TYPE_LABELS[event.type]}
          </span>
        </div>

        <div className={cn("brief-card cal-evt-brief", `cal-evt-brief-${event.type}`)}>
          <div className="eyebrow">Schedule</div>
          <div className="cal-evt-meta">
            <div className="cal-evt-meta-row">
              <span className="cal-evt-meta-k">Date</span>
              <span className="cal-evt-meta-v">{format(anchor, "EEE d MMM yyyy")}</span>
            </div>
            <div className="cal-evt-meta-row">
              <span className="cal-evt-meta-k">Time</span>
              <span className="cal-evt-meta-v">{scheduleLine}</span>
            </div>
          </div>
        </div>

        {(event.sub || event.location) && (
          <div>
            <div className="insp-section-head">
              <div className="l">Details</div>
            </div>
            <div className={cn("brief-card mt-2 cal-evt-brief", `cal-evt-brief-${event.type}`)}>
              {event.sub && (
                <p className="m-0 text-[12.5px] leading-relaxed text-[var(--fg-2)]">{event.sub}</p>
              )}
              {event.location && (
                <div
                  className={cn(
                    "flex items-start gap-2 text-[12.5px] text-[var(--fg-2)]",
                    event.sub && "mt-3 border-t border-[var(--border-default)] pt-3",
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--fg-4)]" strokeWidth={1.75} />
                  <span className="font-[family-name:var(--font-serif)] italic leading-snug">{event.location}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {couple?.value ? (
          <div>
            <div className="insp-section-head">
              <div className="l">Linked wedding</div>
            </div>
            <div className="brief-card mt-2">
              <p className="m-0 text-[13px] font-medium text-[var(--fg-1)]">{couple.label}</p>
              <Link className="open-link mt-3 inline-flex" to={`${weddingLinkBase}/${couple.value}`}>
                Open in Pipeline →
              </Link>
            </div>
          </div>
        ) : null}

        {prep ? (
          <div className="space-y-4">
            <div>
              <div className="insp-section-head">
                <div className="l">Story so far</div>
              </div>
              <div className="brief-card mt-2">
                <p className="m-0 text-[12.5px] leading-relaxed text-[var(--fg-3)]">{prep.storySoFar}</p>
              </div>
            </div>
            <div>
              <div className="insp-section-head">
                <div className="l">My notes</div>
              </div>
              <div className="brief-card mt-2">
                <p className="m-0 font-[family-name:var(--font-serif)] text-[12.5px] italic leading-relaxed text-[var(--fg-2)]">
                  {prep.myNotes}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="cal-inspector-foot shrink-0 border-t border-[var(--border-default)] px-[18px] py-3.5">
        <div className="p-actions flex-wrap">
          {event.meetUrl ? (
            <a
              href={event.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-btn primary inline-flex items-center gap-1.5"
            >
              <Video className="h-3.5 w-3.5" strokeWidth={2} />
              Join call
            </a>
          ) : null}
          <button type="button" className="p-btn ghost" onClick={() => openEditEvent(event)}>
            Reschedule
          </button>
        </div>
      </div>
    </aside>
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
