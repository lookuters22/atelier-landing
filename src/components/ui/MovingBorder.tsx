import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  className,
  as: Tag = "div",
  duration = 8,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "button";
  duration?: number;
} & React.HTMLAttributes<HTMLElement>) {
  const prefersReduced = useReducedMotion();

  return (
    <Tag
      className={cn("relative overflow-hidden rounded-xl", className)}
      style={{ padding: "1px" }}
      {...(rest as Record<string, unknown>)}
    >
      {!prefersReduced && (
        <motion.div
          className="pointer-events-none absolute inset-[-200%]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0% 70%, rgba(255,255,255,0.35) 85%, transparent 100%)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration, repeat: Infinity, ease: "linear" }}
        />
      )}
      <div className="relative">{children}</div>
    </Tag>
  );
}
