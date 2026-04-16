import type { MouseEvent } from "react";

export function handleGlowMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--glow-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
  el.style.setProperty("--glow-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  el.style.setProperty("--glow-intensity", "1");
}

export function handleGlowLeave(e: MouseEvent) {
  (e.currentTarget as HTMLElement).style.setProperty("--glow-intensity", "0");
}
