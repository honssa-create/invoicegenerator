import type { MouseEvent, TouchEvent } from 'react';

/** Movement (px) above this is treated as a scroll, not a tap. */
export const TAP_SLOP_PX = 12;
const GHOST_CLICK_MS = 800;

let lastTouchTapAt = 0;

export function isStationaryTap(dx: number, dy: number, slop = TAP_SLOP_PX): boolean {
  return Math.abs(dx) <= slop && Math.abs(dy) <= slop;
}

/**
 * iOS 15 Safari (iPad Air 2 / A1566) often never fires `click` on controls
 * inside overflow / after a sticky hover. Use touchend for the tap, and ignore
 * the delayed compatibility click so the handler runs once.
 */
export function tapProps(onTap: () => void, disabled = false) {
  let startX = 0;
  let startY = 0;
  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      const t = event.changedTouches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    },
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      if (disabled) return;
      const t = event.changedTouches[0];
      if (!t) return;
      if (!isStationaryTap(t.clientX - startX, t.clientY - startY)) return;
      lastTouchTapAt = Date.now();
      event.preventDefault();
      onTap();
    },
    onClick: (_event?: MouseEvent<HTMLElement>) => {
      if (disabled) return;
      if (Date.now() - lastTouchTapAt < GHOST_CLICK_MS) return;
      onTap();
    },
  };
}
