import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Big Sur 24-hour wallpaper — 16 frames (`export/24hr-BigSur-1.json` metadata + assets in `public/today-bg/`).
 *
 * The JSON only groups frames by phase (sunrise / day / sunset / night); it does not assign exact
 * clock times per image. Filenames are `24hr-BigSur-1_<n>.webp` for n=1..16 but **filename order is
 * not the visual day cycle**. Visual inspection of the pack yields this natural 24h sequence (night
 * → dawn → day → dusk), then loops back:
 *
 *   14 → 15 → 16 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → (back to 14)
 *
 * Frame **14** is treated as the cycle start (aligned with local midnight anchor index 0). We map
 * local time to 16 equal segments (1.5h each) and crossfade between adjacent frames in this order —
 * same minute-based interpolation pattern as the previous 6-layer desert implementation.
 */
const BIG_SUR_FRAME_ORDER = [14, 15, 16, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

const FRAME_COUNT = BIG_SUR_FRAME_ORDER.length;
const HOURS_PER_SEGMENT = 24 / FRAME_COUNT;

const LAYERS = BIG_SUR_FRAME_ORDER.map((frameNum, i) => ({
  /** Stable key for React (filename suffix in frame order). */
  key: `24hr-BigSur-1_${frameNum}`,
  src: `/today-bg/24hr-BigSur-1_${frameNum}.webp`,
  /** Decimal local hour [0,24) where this frame is the start of its segment; segment i runs [anchor_i, anchor_{i+1}). */
  anchor: i * HOURS_PER_SEGMENT,
}));

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const TICK_MS = 60_000;

function getDecimalHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

function computeOpacities(now: number): number[] {
  const opacities = new Array(LAYERS.length).fill(0);
  const n = LAYERS.length;

  for (let i = 0; i < n; i++) {
    const a = LAYERS[i].anchor;
    const b = LAYERS[(i + 1) % n].anchor;
    const span = b > a ? b - a : 24 - a + b;

    let elapsed = now - a;
    if (elapsed < 0) elapsed += 24;

    if (elapsed <= span) {
      const t = elapsed / span;
      opacities[i] = 1 - t;
      opacities[(i + 1) % n] = t;
      break;
    }
  }

  return opacities;
}

export function DynamicBackground() {
  const [opacities, setOpacities] = useState(() => computeOpacities(getDecimalHour()));
  const [skipTransition, setSkipTransition] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setOpacities(computeOpacities(getDecimalHour()));
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [tick]);

  useEffect(() => {
    startInterval();

    const onVisibilityChange = () => {
      setIsTabVisible(!document.hidden);

      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      setSkipTransition(true);
      setOpacities(computeOpacities(getDecimalHour()));

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSkipTransition(false);
        });
      });

      startInterval();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tick, startInterval]);

  const transition = skipTransition ? "opacity 0s" : "opacity 60s linear";

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-black">
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1) translateZ(0); }
          50% { transform: scale(1.05) translateZ(0); }
        }
      `}</style>

      <div
        className="absolute inset-0"
        style={{
          animation: "breathe 80s ease-in-out infinite",
          animationPlayState: isTabVisible ? "running" : "paused",
        }}
      >
        {LAYERS.map((layer, i) => (
          <div
            key={layer.key}
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('${layer.src}')`,
              opacity: opacities[i],
              transition,
              willChange: "opacity, transform",
              transform: "translateZ(0)",
            }}
          />
        ))}
      </div>

      {/* Readability scrim — tuned slightly lighter than Ana’s desert default so Big Sur stays vivid */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(180deg, rgba(12,14,18,0.18) 0%, rgba(12,14,18,0.06) 28%, rgba(12,14,18,0.04) 45%, rgba(12,14,18,0.12) 70%, rgba(12,14,18,0.28) 100%), radial-gradient(1200px 700px at 80% 20%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 100%)",
        }}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: NOISE_SVG,
          backgroundRepeat: "repeat",
          mixBlendMode: "overlay",
          opacity: 0.03,
        }}
      />
    </div>
  );
}
