'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Option = { id: number; label: string };

export default function LinkedRecordPicker({
  value,
  onChange,
  options,
  fallback,
  onSearch,
  searchPlaceholder,
  emptyLabel,
  className,
}: {
  value: string | number | null;
  onChange: (next: string) => void;
  options: Option[];
  fallback?: Option | null;
  onSearch: (query: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  className: string;
}) {
  const [query, setQuery] = useState('');
  const skipInitialSearch = useRef(true);

  useEffect(() => {
    if (skipInitialSearch.current) {
      skipInitialSearch.current = false;
      return;
    }
    const timer = window.setTimeout(() => onSearch(query), 250);
    return () => window.clearTimeout(timer);
  }, [query, onSearch]);

  const shown = useMemo(() => {
    const selected = value == null || value === '' ? null : Number(value);
    if (!selected || options.some((option) => option.id === selected)) return options;
    if (fallback && fallback.id === selected) return [fallback, ...options];
    return options;
  }, [options, value, fallback]);

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        className={className}
      />
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} className={className}>
        <option value="">{emptyLabel}</option>
        {shown.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
