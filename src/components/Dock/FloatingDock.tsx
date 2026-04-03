import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";

export type DockItem = {
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick?: () => void;
  active?: boolean;
};

export function FloatingDock({
  items,
  desktopClassName,
}: {
  items: DockItem[];
  desktopClassName?: string;
}) {
  return <FloatingDockDesktop items={items} className={desktopClassName} />;
}

function FloatingDockDesktop({
  items,
  className,
}: {
  items: DockItem[];
  className?: string;
}) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn("relative mx-auto w-fit max-w-[calc(100vw-2rem)]", className)}
    >
      {/* Top/bottom padding gives room for magnify + labels without clipping; glass stays a clipped pill behind the row. */}
      <div className="pt-10 pb-3">
        <div className="relative min-h-16 w-full">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[999px] shadow-[0_6px_12px_rgba(0,0,0,0.1)]"
            aria-hidden
          >
            <div className="glass-shell h-full w-full rounded-[999px]">
              <div className="glass-inner rounded-[999px]" />
            </div>
          </div>
          <div className="relative z-10 flex h-16 min-h-16 max-w-full min-w-0 items-end justify-center gap-5 px-4 pb-2.5 pt-1.5">
            {items.map((item) => (
              <IconContainer mouseX={mouseX} key={item.title} {...item} />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function IconContainer({
  mouseX,
  title,
  icon,
  onClick,
  active = false,
}: {
  mouseX: MotionValue;
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);

  const width = useSpring(widthTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const height = useSpring(heightTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const widthIcon = useSpring(widthTransformIcon, { mass: 0.1, stiffness: 150, damping: 12 });
  const heightIcon = useSpring(heightTransformIcon, { mass: 0.1, stiffness: 150, damping: 12 });

  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      ref={ref}
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      className={cn(
        "group relative flex aspect-square cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/15 transition-colors hover:border-white/20 hover:bg-black/25",
        active && "border-white/25 bg-black/30",
      )}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 2, x: "-50%" }}
            className="absolute -top-8 left-1/2 w-fit rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-normal whitespace-pre text-white shadow-[0_6px_12px_rgba(0,0,0,0.2)] backdrop-blur-md"
          >
            {title}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        style={{ width: widthIcon, height: heightIcon }}
        className={cn(
          "flex items-center justify-center transition-colors",
          active ? "text-white" : "text-white/70 group-hover:text-white",
        )}
      >
        {icon}
      </motion.div>
    </motion.div>
  );
}
