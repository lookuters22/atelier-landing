import { useMemo } from "react";
import { motion, type Variants } from "framer-motion";

/**
 * Avoid filter:blur on the whole shell: thin resizable `Separator` rails (bg-border)
 * smear into harsh black bands when blurred. Exit uses opacity + scale only.
 */
const baseInitialExit: Pick<Variants, "initial" | "exit"> = {
  initial: {
    opacity: 0,
    filter: "blur(10px)",
    scale: 0.98,
  },
  exit: {
    opacity: 0,
    filter: "blur(0px)",
    scale: 1.02,
    transition: {
      duration: 0.55,
      ease: [0.76, 0, 0.24, 1],
    },
  },
};

function buildVariants(longTodayEntrance: boolean): Variants {
  return {
    ...baseInitialExit,
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      scale: 1,
      transition: {
        duration: longTodayEntrance ? 1.35 : 0.8,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };
}

export function CinematicTransition({
  children,
  longTodayEntrance = false,
}: {
  children: React.ReactNode;
  /** Slower settle-in only for the Today dashboard. */
  longTodayEntrance?: boolean;
}) {
  const spatialVariants = useMemo(
    () => buildVariants(longTodayEntrance),
    [longTodayEntrance],
  );

  return (
    <motion.div
      variants={spatialVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full w-full"
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </motion.div>
  );
}
