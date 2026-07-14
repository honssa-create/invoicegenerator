'use client';

import {
  UTILITY_BILLING_MODE_LABELS,
  UTILITY_BILLING_MODE_ORDER,
  type UtilityBillingMode,
} from '@/lib/rentals';

interface Props {
  value: UtilityBillingMode;
  onChange: (mode: UtilityBillingMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

const MODE_HINTS: Record<UtilityBillingMode, string> = {
  tenant_pays: 'Water & electricity excluded from company debit notes.',
  company_sub_meter: 'Simple meter: (current − previous) × rate per unit.',
  company_shared_meter: 'Shared meter split (213A): net usage after other units.',
};

export default function UtilityBillingPicker({ value, onChange, disabled, compact }: Props) {
  return (
    <div className={`grid ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'} gap-3`}>
      {UTILITY_BILLING_MODE_ORDER.map((mode) => {
        const selected = value === mode;
        return (
          <label
            key={mode}
            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
              selected ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-200' : 'border-gray-200 hover:border-gray-300'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name="utilityBillingMode"
              value={mode}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(mode)}
              className="mt-1 h-4 w-4 border-gray-300 text-brand-600 shrink-0"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900 leading-snug">
                {UTILITY_BILLING_MODE_LABELS[mode]}
              </span>
              {!compact && (
                <span className="block text-xs text-gray-500 mt-1">{MODE_HINTS[mode]}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
