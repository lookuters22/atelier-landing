import { CinematicTransition } from "./CinematicTransition";

/** Wraps route/mode content for AnimatePresence; uses shared cinematic blur + scale. */
export function PageTransition({
  children,
  longTodayEntrance = false,
}: {
  children: React.ReactNode;
  longTodayEntrance?: boolean;
}) {
  return (
    <CinematicTransition longTodayEntrance={longTodayEntrance}>
      {children}
    </CinematicTransition>
  );
}
