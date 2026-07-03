'use client';

import { useEffect, useRef, useState } from 'react';

interface TagSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAdd: (value: string) => Promise<void> | void;
  placeholder?: string;
}

export default function TagSelect({ value, options, onChange, onAdd, placeholder }: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o.toLowerCase() === q.toLowerCase());

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const handleAdd = async () => {
    if (!q || adding) return;
    setAdding(true);
    try {
      await onAdd(q);
      select(q);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm text-left bg-white"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder || 'Select…'}
        </span>
        <span className="text-gray-400 ml-2">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!exactMatch && q) handleAdd();
                  else if (filtered[0]) select(filtered[0]);
                }
              }}
              placeholder="Search or add options…"
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && !q && (
              <div className="px-3 py-2 text-xs text-gray-400">No options yet</div>
            )}
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
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
                onClick={handleAdd}
                disabled={adding}
                className="w-full text-left px-3 py-2 text-sm text-brand-700 font-medium hover:bg-brand-50 border-t border-gray-100 disabled:opacity-50"
              >
                {adding ? 'Adding…' : `+ Add “${q}”`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
