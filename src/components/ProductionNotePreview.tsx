'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampTextOffset,
  productionNoteTextLines,
  type ProductionNoteFields,
  type ProductionNoteTextOffset,
} from '@/lib/production-note';

interface Props {
  imageSrc: string | null;
  fields: ProductionNoteFields;
  textOffset: ProductionNoteTextOffset;
  onTextOffsetChange: (next: ProductionNoteTextOffset) => void;
}

/**
 * Live preview: effect image as full background + draggable white text block.
 * Position is stored as fractions of the image size.
 */
export default function ProductionNotePreview({
  imageSrc,
  fields,
  textOffset,
  onTextOffsetChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const lines = productionNoteTextLines(fields);

  useEffect(() => {
    setNatural(null);
  }, [imageSrc]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => setStageWidth(stage.clientWidth));
    ro.observe(stage);
    setStageWidth(stage.clientWidth);
    return () => ro.disconnect();
  }, [imageSrc]);

  const previewFontPx =
    natural && stageWidth > 0
      ? Math.max(11, Math.round(Math.min(natural.w, natural.h) * 0.028 * (stageWidth / natural.w)))
      : 14;

  const measureBlockFrac = useCallback(() => {
    const stage = stageRef.current;
    const text = textRef.current;
    if (!stage || !text) return { w: 0.35, h: 0.22 };
    const sw = stage.clientWidth || 1;
    const sh = stage.clientHeight || 1;
    return {
      w: text.offsetWidth / sw,
      h: text.offsetHeight / sh,
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageSrc || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: textOffset.x,
      originY: textOffset.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !stage) return;
    const sw = stage.clientWidth || 1;
    const sh = stage.clientHeight || 1;
    const dx = (e.clientX - drag.startClientX) / sw;
    const dy = (e.clientY - drag.startClientY) / sh;
    const frac = measureBlockFrac();
    onTextOffsetChange(
      clampTextOffset(
        { x: drag.originX + dx, y: drag.originY + dy },
        frac.w,
        frac.h
      )
    );
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  if (!imageSrc) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-gray-400">
        Upload or select an effect image to preview
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-[#3a3a3a] select-none">
      <div ref={stageRef} className="relative w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Effect"
          className="block w-full h-auto"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            setNatural({ w: el.naturalWidth, h: el.naturalHeight });
          }}
        />
        {lines.length > 0 && (
          <div
            ref={textRef}
            role="group"
            aria-label="Production note text — drag to reposition"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute cursor-grab active:cursor-grabbing touch-none px-1 py-0.5 rounded-sm hover:ring-2 hover:ring-white/40"
            style={{
              left: `${textOffset.x * 100}%`,
              top: `${textOffset.y * 100}%`,
              color: '#fff',
              textShadow: '0 1px 3px rgba(0,0,0,0.65)',
              fontWeight: 600,
              fontSize: previewFontPx,
              lineHeight: 1.45,
              whiteSpace: 'pre',
              fontFamily:
                '"Helvetica Neue", Helvetica, Arial, "PingFang HK", "PingFang TC", "Noto Sans TC", sans-serif',
            }}
          >
            {lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
      </div>
      <p className="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/90 pointer-events-none">
        Drag text to adjust
      </p>
    </div>
  );
}
