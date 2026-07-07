'use client';

import { UTILITY_BILLING_MODE_LABELS, type UtilityBillingMode } from '@/lib/rentals';

interface Props {
  value: UtilityBillingMode;
  onChange: (mode: UtilityBillingMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function UtilityBillingPicker({ value, onChange, disabled, compact }: Props) {
  return (
    <div className={`grid ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'} gap-3`}>
      {(['tenant_pays', 'company_proxy'] as UtilityBillingMode[]).map((mode) => {
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
              className="mt-1 h-4 w-4 border-gray-300 text-brand-600"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">{UTILITY_BILLING_MODE_LABELS[mode]}</span>
              {!compact && (
                <span className="block text-xs text-gray-500 mt-1">
                  {mode === 'tenant_pays'
                    ? 'Water & electricity excluded from company debit notes.'
                    : 'Company bills utilities on the debit note.'}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
