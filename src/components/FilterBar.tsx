'use client';

import type { ReactNode } from 'react';

interface FilterBarProps {
  dateStart: string;
  dateEnd: string;
  onDateStart: (v: string) => void;
  onDateEnd: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  onClear: () => void;
  children?: ReactNode;
}

export default function FilterBar({
  dateStart,
  dateEnd,
  onDateStart,
  onDateEnd,
  search,
  onSearch,
  searchPlaceholder,
  onClear,
  children,
}: FilterBarProps) {
  const field = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-6 flex flex-wrap items-end gap-3">
      <div className="flex flex-col">
        <label className="text-[11px] font-medium text-gray-500 mb-1">Start Date</label>
        <input type="date" value={dateStart} onChange={(e) => onDateStart(e.target.value)} className={field} />
      </div>
      <div className="flex flex-col">
        <label className="text-[11px] font-medium text-gray-500 mb-1">End Date</label>
        <input type="date" value={dateEnd} onChange={(e) => onDateEnd(e.target.value)} className={field} />
      </div>
      {children}
      <div className="flex flex-col flex-1 min-w-[180px]">
        <label className="text-[11px] font-medium text-gray-500 mb-1">Search</label>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder || 'Search…'}
          className={field}
        />
      </div>
      <button
        onClick={onClear}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
      >
        Clear Filters
      </button>
    </div>
  );
}
