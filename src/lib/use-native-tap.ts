'use client';

import { useEffect, useRef } from 'react';
import { isStationaryTap } from '@/lib/tap-action';

const GHOST_CLICK_MS = 800;

/**
 * iOS 15.8 Safari often drops React synthetic click/touchend (delegated,
 * sometimes passive). Bind non-passive listeners on the real DOM node.
 */
export function useNativeTap<T extends HTMLElement>(onTap: () => void, disabled = false) {
  const ref = useRef<T>(null);
  const onTapRef = useRef(onTap);
  const disabledRef = useRef(disabled);
  onTapRef.current = onTap;
  disabledRef.current = disabled;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let startX = 0;
    let startY = 0;
    let lastTouchTapAt = 0;

    const onStart = (event: TouchEvent) => {
      const t = event.changedTouches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onEnd = (event: TouchEvent) => {
      if (disabledRef.current) return;
      const t = event.changedTouches[0];
      if (!t || !isStationaryTap(t.clientX - startX, t.clientY - startY)) return;
      lastTouchTapAt = Date.now();
      event.preventDefault();
      event.stopPropagation();
      onTapRef.current();
    };
    const onClick = (event: MouseEvent) => {
      if (disabledRef.current) return;
      if (Date.now() - lastTouchTapAt < GHOST_CLICK_MS) {
        event.preventDefault();
        return;
      }
      onTapRef.current();
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchend', onEnd, { passive: false });
    node.addEventListener('click', onClick);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('click', onClick);
    };
  }, []);

  return ref;
}
