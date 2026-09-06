'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bi } from '@/lib/ui-labels';

interface MultiChoiceSelectProps {
  values: string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
  /** Fired when the dropdown closes (or a chip is removed while closed) so parents can persist. */
  onCommit?: (values: string[]) => void;
  placeholder?: string;
}

export default function MultiChoiceSelect({
  values,
  options = [],
  onChange,
  onCommit,
  placeholder,
}: MultiChoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const valuesRef = useRef(values);
  const onCommitRef = useRef(onCommit);
  const openRef = useRef(open);
  valuesRef.current = values;
  onCommitRef.current = onCommit;
  openRef.current = open;
  const optionSet = useMemo(() => new Set(options), [options]);

  const catalogSelected = values.filter((v) => optionSet.has(v));
  const orphans = values.filter((v) => v.trim() && !optionSet.has(v));

  const close = () => {
    setOpen(false);
    setQuery('');
    onCommitRef.current?.(valuesRef.current);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!openRef.current) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        onCommitRef.current?.(valuesRef.current);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  const emit = (catalog: string[], keepOrphans = orphans, commit = false) => {
    const next = [...catalog, ...keepOrphans];
    onChange(next);
    valuesRef.current = next;
    if (commit) onCommit?.(next);
  };

  const toggle = (option: string) => {
    const next = catalogSelected.includes(option)
      ? catalogSelected.filter((v) => v !== option)
      : [...catalogSelected, option];
    emit(next);
  };

  const removeOrphan = (orphan: string) => {
    emit(catalogSelected, orphans.filter((v) => v !== orphan), !open);
  };

  const removeCatalog = (option: string) => {
    emit(
      catalogSelected.filter((v) => v !== option),
      orphans,
      !open
    );
  };

  const hasSelection = catalogSelected.length > 0 || orphans.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        className="w-full min-h-[42px] flex flex-wrap items-center gap-1.5 px-2.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm text-left bg-white"
      >
        {!hasSelection ? (
          <span className="text-gray-400 px-0.5">{placeholder || '選擇…'}</span>
        ) : (
          <>
            {catalogSelected.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 max-w-full rounded-md bg-brand-50 text-brand-800 px-2 py-0.5 text-xs font-medium"
              >
                <span className="truncate">{v}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCatalog(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      removeCatalog(v);
                    }
                  }}
                  className="text-brand-600 hover:text-brand-900 shrink-0"
                  aria-label={bi('Remove', '移除')}
                >
                  ×
                </span>
              </span>
            ))}
            {orphans.map((v) => (
              <span
                key={`orphan-${v}`}
                className="inline-flex items-center gap-1 max-w-full rounded-md bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 text-xs"
                title={bi('Not in catalog — remove or re-select', '不在選項清單 — 請移除或重新選擇')}
              >
                <span className="truncate">{v}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOrphan(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      removeOrphan(v);
                    }
                  }}
                  className="text-amber-700 hover:text-amber-950 shrink-0"
                  aria-label={bi('Remove', '移除')}
                >
                  ×
                </span>
              </span>
            ))}
          </>
        )}
        <span className="text-gray-400 ml-auto shrink-0 pl-1">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered[0]) toggle(filtered[0]);
                }
              }}
              placeholder="搜尋選項…"
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('No matches', '沒有符合的選項')}</div>
            )}
            {filtered.map((o) => {
              const checked = catalogSelected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(o)}
                  className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-brand-50 ${
                    checked ? 'text-brand-700 font-medium bg-brand-50/60' : 'text-gray-700'
                  }`}
                >
                  <span
                    className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${
                      checked ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 bg-white'
                    }`}
                    aria-hidden
                  >
                    {checked ? '✓' : ''}
                  </span>
                  <span className="min-w-0">{o}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
