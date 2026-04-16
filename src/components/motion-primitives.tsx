import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export function MotionPage({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function MotionSection({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={fadeUp} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

export const MotionCard = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(
  function MotionCard({ children, className, ...rest }, ref) {
    return (
      <motion.div
        ref={ref}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={className}
        {...rest}
      >
        {children}
      </motion.div>
    );
  },
);

export function MotionTabContent({
  children,
  tabKey,
  className,
}: {
  children: React.ReactNode;
  tabKey: string;
  className?: string;
}) {
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
