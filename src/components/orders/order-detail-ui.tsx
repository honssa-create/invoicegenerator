import type { ReactNode } from 'react';

export const ORDER_DETAIL_SOFT_INPUT =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors';

/** Clamp typed quantity to ≥ 0 (empty stays empty). */
export function nonNeg(value: string): string {
  if (value.trim() === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n < 0 ? '0' : value;
}

export function labeled(label: string, node: ReactNode, hint?: string) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-900 mb-1.5">
        {label}
        {hint ? <span className="text-gray-400 font-normal"> · {hint}</span> : null}
      </label>
      {node}
    </div>
  );
}

export function readOnly(label: string, value: ReactNode) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-900">{label}</p>
      <p className="text-lg font-semibold text-gray-900 leading-tight mt-0.5">{value}</p>
    </div>
  );
}
