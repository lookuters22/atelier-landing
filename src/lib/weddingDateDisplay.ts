type Row = {
  wedding_date: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
};

const DATE_TBD = "Date TBD";

/** Wedding detail hero — long-form date or explicit range. */
export function formatWeddingDetailWhen(row: Row): string {
  const es = row.event_start_date;
  const ee = row.event_end_date;
  if (es && ee) {
    const a = new Date(es);
    const b = new Date(ee);
    if (a.getTime() !== b.getTime()) {
      const opts: Intl.DateTimeFormatOptions = {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      };
      return `${a.toLocaleDateString("en-GB", opts)} – ${b.toLocaleDateString("en-GB", opts)}`;
    }
  }
  if (row.wedding_date == null || String(row.wedding_date).trim() === "") {
    return DATE_TBD;
  }
  const d = new Date(row.wedding_date);
  if (Number.isNaN(d.getTime())) return DATE_TBD;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Pipeline list — compact range or single date. */
export function formatWeddingPipelineShortDate(row: Row): string {
  const es = row.event_start_date;
  const ee = row.event_end_date;
  if (es && ee) {
    const a = new Date(es);
    const b = new Date(ee);
    if (a.getTime() !== b.getTime()) {
      const short: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "short",
        year: "numeric",
      };
      return `${a.toLocaleDateString("en-GB", short)}–${b.toLocaleDateString("en-GB", short)}`;
    }
  }
  if (row.wedding_date == null || String(row.wedding_date).trim() === "") {
    return "TBD";
  }
  const d = new Date(row.wedding_date);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
