import { useEffect, useRef, useState, useCallback } from "react";

const LAYERS = [
  { src: "/dynamic%20walpaper/desert-layer-1.webp", anchor: 2 },
  { src: "/dynamic%20walpaper/desert-layer-0.webp", anchor: 6 },
  { src: "/dynamic%20walpaper/desert-layer-2.webp", anchor: 10 },
  { src: "/dynamic%20walpaper/desert-layer-3.webp", anchor: 14 },
  { src: "/dynamic%20walpaper/desert-layer-4.webp", anchor: 18.5 },
  { src: "/dynamic%20walpaper/desert-layer-5.webp", anchor: 22 },
];

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
  const [opacities, setOpacities] = useState(() =>
    computeOpacities(getDecimalHour()),
  );
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
            key={layer.src}
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

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: NOISE_SVG,
          backgroundRepeat: "repeat",
          mixBlendMode: "overlay",
          opacity: 0.04,
        }}
      />
    </div>
  );
}
