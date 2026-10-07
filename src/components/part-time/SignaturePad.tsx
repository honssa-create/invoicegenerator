'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
};

type Props = {
  onEmptyChange?: (empty: boolean) => void;
};

function canvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: ((event.clientX - rect.left) / width) * canvas.width,
    y: ((event.clientY - rect.top) / height) * canvas.height,
  };
}

function applyStroke(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width > 0 ? canvas.width / rect.width : 1;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = Math.max(2.5, 2.4 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ onEmptyChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emptyRef = useRef(true);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const onEmptyChangeRef = useRef(onEmptyChange);
  onEmptyChangeRef.current = onEmptyChange;

  const setEmpty = (empty: boolean) => {
    emptyRef.current = empty;
    onEmptyChangeRef.current?.(empty);
  };

  const paintBlank = (force: boolean) => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    if (!force && !emptyRef.current) return;
    const cssWidth = parent.clientWidth;
    const cssHeight = canvas.clientHeight || 176;
    if (cssWidth < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    paintBlank(true);
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => paintBlank(false));
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      paintBlank(true);
      setEmpty(true);
    },
    isEmpty: () => emptyRef.current,
    toDataUrl: () => (emptyRef.current ? '' : canvasRef.current?.toDataURL('image/png') || ''),
  }));

  return (
    <canvas
      ref={canvasRef}
      className="h-44 w-full touch-none select-none rounded-xl border border-gray-300 bg-white"
      style={{ touchAction: 'none' }}
      aria-label="Signature"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        event.preventDefault();
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* pointer already released */
        }
        drawingRef.current = true;
        applyStroke(ctx, canvas);
        const p = canvasPoint(canvas, event);
        lastRef.current = p;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 0.01, p.y + 0.01);
        ctx.stroke();
        if (emptyRef.current) setEmpty(false);
      }}
      onPointerMove={(event) => {
        if (!drawingRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const last = lastRef.current;
        if (!canvas || !ctx || !last) return;
        const p = canvasPoint(canvas, event);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        lastRef.current = p;
      }}
      onPointerUp={() => {
        drawingRef.current = false;
        lastRef.current = null;
      }}
      onPointerCancel={() => {
        drawingRef.current = false;
        lastRef.current = null;
      }}
    />
  );
});
