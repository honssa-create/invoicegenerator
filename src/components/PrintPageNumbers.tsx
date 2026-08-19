'use client';

import { useLayoutEffect, useState } from 'react';
import {
  countPrintPages,
  formatPrintPageLabel,
  PRINT_PAGE_HEIGHT_MM,
} from '@/lib/print-page-numbers';

function pageHeightPx(root: HTMLElement): number {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;height:${PRINT_PAGE_HEIGHT_MM}mm;width:0;pointer-events:none`;
  root.appendChild(probe);
  const h = probe.offsetHeight;
  root.removeChild(probe);
  return h > 0 ? h : 1;
}

/** Count A4 pages from the in-flow body, ignoring stretched min-height and overlays. */
export function useA4PrintPageCount(
  pageRef: { current: HTMLElement | null },
  bodyRef: { current: HTMLElement | null },
) {
  const [total, setTotal] = useState(1);

  useLayoutEffect(() => {
    const page = pageRef.current;
    const body = bodyRef.current;
    if (!page || !body) return;

    const measure = () => {
      const cs = getComputedStyle(page);
      const extraY =
        (parseFloat(cs.paddingTop) || 0) +
        (parseFloat(cs.paddingBottom) || 0) +
        (parseFloat(cs.borderTopWidth) || 0) +
        (parseFloat(cs.borderBottomWidth) || 0);
      const next = countPrintPages(body.offsetHeight + extraY, pageHeightPx(page));
      setTotal((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    window.addEventListener('beforeprint', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('beforeprint', measure);
    };
  }, [pageRef, bodyRef]);

  return total;
}

export default function PrintPageNumbers({ total }: { total: number }) {
  const pages = Math.max(1, total);
  return (
    <>
      {Array.from({ length: pages }, (_, i) => (
        <div
          key={i}
          className="quo-page-number"
          aria-label={formatPrintPageLabel(i + 1, pages)}
          style={{ top: `calc(${i} * ${PRINT_PAGE_HEIGHT_MM}mm)` }}
        >
          {formatPrintPageLabel(i + 1, pages)}
        </div>
      ))}
    </>
  );
}
