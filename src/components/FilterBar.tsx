'use client';

import { useId, type ReactNode } from 'react';
import { openNativeDatePicker } from '@/lib/open-date-picker';
import { BTN, FILTER } from '@/lib/ui-labels';

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
  const field =
    'w-full min-h-[44px] px-3 py-2.5 sm:px-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-brand-500 outline-none';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-6 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3">
      <div className="grid grid-cols-2 gap-3 sm:contents">
        <FilterDateField
          label={FILTER.startDate}
          value={dateStart}
          onChange={onDateStart}
          className={field}
        />
        <FilterDateField
          label={FILTER.endDate}
          value={dateEnd}
          onChange={onDateEnd}
          className={field}
        />
      </div>
      {children}
      <div className="flex flex-col flex-1 min-w-0 sm:min-w-[180px]">
        <label className="text-[11px] font-medium text-gray-500 mb-1">{BTN.search}</label>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder || FILTER.searchPlaceholder}
          className={field}
        />
      </div>
      <button
        type="button"
        onClick={onClear}
        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
      >
        {BTN.clearFilters}
      </button>
    </div>
  );
}

function FilterDateField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col min-w-0">
      <label htmlFor={id} className="text-[11px] font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => openNativeDatePicker(e.currentTarget)}
        className={className}
      />
    </div>
  );
}
