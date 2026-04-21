import { useCalendarMode } from "./CalendarModeContext";
import { CalendarScheduleGrid } from "./CalendarScheduleGrid";
import { BookingLinksTable } from "./BookingLinksTable";
import { TravelBlockedView } from "./TravelBlockedView";

export function CalendarGrid() {
  const { activeNav } = useCalendarMode();

  return (
    <div className="cal-main ana-calendar-port flex h-full min-h-0 min-w-0 flex-col bg-[var(--surface-canvas)]">
      {activeNav === "booking-links" ? (
        <BookingLinksTable />
      ) : activeNav === "travel" ? (
        <TravelBlockedView />
      ) : (
        <CalendarScheduleGrid />
      )}
    </div>
  );
}
