import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";

const EASE = [0.75, 0, 0.25, 1] as const;

const NAV_ITEMS = ["Products", "About", "Learn"];

export function Header() {
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() || 0;
    if (latest > 20 && latest > previous) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  return (
    <motion.header
      initial={{ opacity: 0, filter: "blur(10px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{
        opacity: { duration: 0.8, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] },
        filter: { duration: 2.2, delay: 0, ease: [0.16, 1, 0.3, 1] },
      }}
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-6 py-6 transform-gpu will-change-transform"
    >
      {/* LEFT: Asymmetric Logo Pill */}
      <div className="glass-shell interactive-glass pointer-events-auto h-[47px] min-w-[120px] cursor-pointer rounded-[32px_32px_32px_0] shadow-[0_6px_12px_rgba(0,0,0,0.1)]">
        <div className="glass-inner justify-center px-6 pb-[2px]">
          <span className="text-body-small text-white">meetANA</span>
        </div>
      </div>

      {/* CENTER: Navigation Strip */}
      <div
        className="pointer-events-auto relative hidden xl:block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="absolute -left-12 -right-12 -top-6 z-0 h-32 bg-transparent" />
        <motion.nav
          animate={{
            y: hidden && !isHovered ? -100 : 0,
            opacity: hidden && !isHovered ? 0 : 1,
          }}
          transition={{ duration: 0.6, ease: EASE }}
          className="glass-shell relative z-10 h-[52px] rounded-[28px] shadow-[0_6px_12px_rgba(0,0,0,0.1)] transform-gpu will-change-transform"
        >
          <div className="glass-inner gap-1 px-1">
            {NAV_ITEMS.map((item) => (
              <button key={item} type="button" className="nav-pill">
                {item}
              </button>
            ))}
          </div>
        </motion.nav>
      </div>

      {/* RIGHT: CTA Pill */}
      <div
        className="glass-shell interactive-glass pointer-events-auto h-[52px] cursor-pointer rounded-[999px] shadow-[0_6px_12px_rgba(0,0,0,0.1)]"
        onClick={() => navigate("/today")}
      >
        <button
          type="button"
          className="glass-inner justify-center px-10 text-body-small text-white whitespace-nowrap"
        >
          Early Access
        </button>
      </div>
    </motion.header>
  );
}
