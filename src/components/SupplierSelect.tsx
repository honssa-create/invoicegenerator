'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { SupplierMatch } from '@/lib/expense-suppliers';

interface SupplierSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAdd: (value: string) => Promise<void> | void;
  placeholder?: string;
  ocrMatch?: SupplierMatch | null;
  onDismissOcrMatch?: () => void;
}

export default function SupplierSelect({
  value,
  options,
  onChange,
  onAdd,
  placeholder = 'Search or type supplier…',
  ocrMatch,
  onDismissOcrMatch,
}: SupplierSelectProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = value.trim();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o.toLowerCase() === q.toLowerCase());
  const showOcrBanner = ocrMatch && value === ocrMatch.supplier;

  const select = (v: string) => {
    onChange(v);
    onDismissOcrMatch?.();
    setOpen(false);
  };

  const handleAdd = async () => {
    if (!q || adding || exactMatch) return;
    setAdding(true);
    try {
      await onAdd(q);
      onChange(q);
      onDismissOcrMatch?.();
      setOpen(false);
    } finally {
      setAdding(false);
    }
  };

  const inputRing = showOcrBanner
    ? 'ring-2 ring-amber-400 border-amber-300 bg-amber-50/40'
    : 'border-gray-300 focus:ring-brand-500';

  return (
    <div ref={ref} className="relative">
      {showOcrBanner && (
        <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          <span className="shrink-0" aria-hidden>✨</span>
          <span className="flex-1">
            Matched from receipt: <strong>{ocrMatch.supplier}</strong>
            {' '}({Math.round(ocrMatch.score * 100)}% · {ocrMatch.method})
          </span>
          <button
            type="button"
            onClick={onDismissOcrMatch}
            className="shrink-0 text-amber-700 hover:text-amber-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onDismissOcrMatch?.();
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!exactMatch && q) handleAdd();
            else if (filtered[0]) select(filtered[0]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none text-sm ${inputRing}`}
      />

      {open && (
        <div
          id={listId}
          className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto py-1"
        >
          {filtered.length === 0 && !q && (
            <div className="px-3 py-2 text-xs text-gray-400">Type to search suppliers…</div>
          )}
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(o)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-brand-50 ${
                o === value ? 'text-brand-700 font-medium bg-brand-50/60' : 'text-gray-700'
              }`}
            >
              {o}
            </button>
          ))}
          {q && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAdd}
              disabled={adding}
              className="w-full text-left px-3 py-2 text-sm text-brand-700 font-medium hover:bg-brand-50 border-t border-gray-100 disabled:opacity-50"
            >
              {adding ? 'Adding…' : `+ Create "${q}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
