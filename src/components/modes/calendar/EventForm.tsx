import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft } from "lucide-react";
import {
  useCalendarMode,
  WEDDING_OPTIONS,
  EVENT_TYPE_LABELS,
  type EventType,
  type CalEvent,
} from "./CalendarModeContext";

const EVENT_TYPES: EventType[] = ["shoot", "consult", "travel", "block"];

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  dateISO: z.string().min(1, "Date is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  type: z.enum(["shoot", "consult", "travel", "block"]),
  sub: z.string().optional(),
  location: z.string().optional(),
  meetUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  weddingId: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

type Props =
  | { mode: "new"; prefillDate: string; prefillTime?: string }
  | { mode: "edit"; event: CalEvent };

export function EventForm(props: Props) {
  const { saveEvent, updateEvent, deleteEvent, closeInspector } = useCalendarMode();

  const defaults: EventFormValues =
    props.mode === "edit"
      ? {
          title: props.event.title,
          dateISO: props.event.dateISO,
          startTime: props.event.startTime ?? "",
          endTime: props.event.endTime ?? "",
          type: props.event.type,
          sub: props.event.sub ?? "",
          location: props.event.location ?? "",
          meetUrl: props.event.meetUrl ?? "",
          weddingId: props.event.weddingId ?? "",
        }
      : {
          title: "",
          dateISO: props.prefillDate,
          startTime: props.prefillTime ?? "",
          endTime: "",
          type: "consult" as EventType,
          sub: "",
          location: "",
          meetUrl: "",
          weddingId: "",
        };

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: defaults,
    mode: "onChange",
  });

  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode === "edit" ? props.event.id : props.prefillDate]);

  const onSubmit = (data: EventFormValues) => {
    const payload = {
      title: data.title,
      dateISO: data.dateISO,
      sub: data.sub ?? "",
      type: data.type as EventType,
      startTime: data.startTime || undefined,
      endTime: data.endTime || undefined,
      location: data.location || undefined,
      meetUrl: data.meetUrl || undefined,
      weddingId: data.weddingId || undefined,
    };

    if (props.mode === "edit") {
      updateEvent(props.event.id, payload);
    } else {
      saveEvent(payload);
    }
  };

  const headTitle = props.mode === "edit" ? props.event.title : "Add to calendar";
  const headSub =
    props.mode === "edit"
      ? "Update details, schedule, and linked wedding."
      : "Block time on the calendar and tie it to a wedding when it helps.";

  return (
    <aside className="cal-inspector ana-calendar-port flex h-full min-h-0 flex-col">
      <div className="cal-evt-head-row shrink-0 border-b border-[var(--border-default)]">
        <button type="button" className="cal-evt-back" onClick={closeInspector} aria-label="Back">
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{props.mode === "edit" ? "Edit event" : "New event"}</div>
          <h3 className="mt-0.5 break-words">{headTitle}</h3>
          <div className="sub mt-1 max-w-[min(100%,42ch)]">{headSub}</div>
        </div>
        <span className="w-9 shrink-0" aria-hidden />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <div className="cal-inspector-body min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4">
          <div className="insp-section-head">
            <div className="l">Details</div>
          </div>
          <div className="mt-2 space-y-3">
            <label className="cal-field">
              <span className="cal-field-lbl">Title</span>
              <input {...register("title")} className="cal-field-inp" placeholder="e.g. Timeline review" />
              {errors.title && <p className="cal-field-err">{errors.title.message}</p>}
            </label>

            <label className="cal-field">
              <span className="cal-field-lbl">Details / notes</span>
              <input {...register("sub")} className="cal-field-inp" placeholder="Short description" />
            </label>

            <label className="cal-field">
              <span className="cal-field-lbl">Location</span>
              <input {...register("location")} className="cal-field-inp" placeholder="Venue or address" />
            </label>
          </div>

          <div className="insp-section-head mt-6">
            <div className="l">Schedule</div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="cal-field sm:col-span-2">
              <span className="cal-field-lbl">Date</span>
              <input type="date" {...register("dateISO")} className="cal-field-inp" />
            </label>
            <label className="cal-field">
              <span className="cal-field-lbl">Start</span>
              <input type="time" {...register("startTime")} className="cal-field-inp" />
            </label>
            <label className="cal-field">
              <span className="cal-field-lbl">End</span>
              <input type="time" {...register("endTime")} className="cal-field-inp" />
            </label>
            <label className="cal-field sm:col-span-2">
              <span className="cal-field-lbl">Type</span>
              <select {...register("type")} className="cal-field-inp">
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="insp-section-head mt-6">
            <div className="l">Links</div>
          </div>
          <div className="mt-2 space-y-3">
            <label className="cal-field">
              <span className="cal-field-lbl">Meet URL</span>
              <input {...register("meetUrl")} className="cal-field-inp" placeholder="https://meet.google.com/..." />
              {errors.meetUrl && <p className="cal-field-err">{errors.meetUrl.message}</p>}
            </label>

            <label className="cal-field">
              <span className="cal-field-lbl">Link to wedding</span>
              <select {...register("weddingId")} className="cal-field-inp">
                {WEDDING_OPTIONS.map((o) => (
                  <option key={o.value || "none"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="cal-inspector-foot flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-default)] px-[18px] py-3.5">
          {props.mode === "edit" ? (
            <button
              type="button"
              className="p-btn danger"
              onClick={() => deleteEvent(props.event.id)}
            >
              Delete
            </button>
          ) : (
            <span className="min-w-[4rem]" aria-hidden />
          )}
          <div className="p-actions ml-auto">
            <button type="button" className="p-btn ghost" onClick={closeInspector}>
              Cancel
            </button>
            <button type="submit" className="p-btn primary" disabled={!isValid}>
              {props.mode === "edit" ? "Save changes" : "Save event"}
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
