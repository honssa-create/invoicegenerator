'use client';

import type { ReactNode } from 'react';
import {
  DEMAND_FORECAST_DATE_FILTER_LABELS,
  DEMAND_FORECAST_DATE_FILTER_TYPES,
  type DemandForecastDateFilterType,
} from '@/lib/demand-forecast';
import { bi } from '@/lib/ui-labels';

export function GoldSegmented<T extends string>({
  value,
  options,
  labels,
  ariaLabel,
  disabled,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, { en: string; zh: string }>;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-[#C8B07A] bg-[#F7F2E8] p-0.5 text-sm"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option;
        const label = labels[option];
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`min-h-[44px] px-3 py-2 rounded-md transition-colors font-medium disabled:opacity-50 ${
              active
                ? 'bg-[#C8B07A] text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            {bi(label.en, label.zh)}
          </button>
        );
      })}
    </div>
  );
}

export function ForecastCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#C8B07A]/60 bg-white shadow-sm overflow-hidden">
      <div className="bg-[#C8B07A] px-4 sm:px-5 py-3">
        <h2 className="text-base sm:text-lg font-bold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-800/80 mt-1">{description}</p>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
      {footer && <div className="px-4 sm:px-5 pb-4 text-xs text-gray-500">{footer}</div>}
    </section>
  );
}

export function DateFilterTypeToggle({
  value,
  onChange,
  disabled,
}: {
  value: DemandForecastDateFilterType;
  onChange: (v: DemandForecastDateFilterType) => void;
  disabled?: boolean;
}) {
  return (
    <GoldSegmented
      value={value}
      options={DEMAND_FORECAST_DATE_FILTER_TYPES}
      labels={DEMAND_FORECAST_DATE_FILTER_LABELS}
      ariaLabel={bi('Date filter basis', '日期篩選基準')}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function shortfallClass(have: number, need: number): string {
  return need > have ? 'text-red-600 font-semibold' : 'text-green-600';
}
