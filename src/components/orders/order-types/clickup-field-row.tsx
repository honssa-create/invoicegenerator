import type { ReactNode } from 'react';
import type { ClickUpFieldIcon } from '@/lib/wedding-gift-clickup-fields';

export const CLICKUP_PLAIN_INPUT =
  'w-full bg-transparent border border-transparent rounded px-1.5 py-1 text-[13px] text-[#292d34] outline-none hover:bg-[#f8f8f9] focus:bg-white focus:border-[#e4e6ea] placeholder:text-[#87909e]';

export function ClickUpDash() {
  return <span className="text-[#87909e]">—</span>;
}

export function ClickUpReadValue({ value }: { value: string | number }) {
  const text = typeof value === 'number'
    ? (Number.isFinite(value) && value !== 0 ? String(Math.round(value * 10000) / 10000) : '')
    : value.trim();
  if (!text || text === '0') return <ClickUpDash />;
  return <span>{text}</span>;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className="shrink-0">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClickUpFieldIcon({ name }: { name: ClickUpFieldIcon }) {
  if (name === 'image') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className="shrink-0">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" />
        <path d="M4 17l5-5 3 3 3-4 5 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'date') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className="shrink-0">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'number') {
    return <Icon d="M5 8h6M8 5v14M15 12h5M17.5 9.5v5" />;
  }
  if (name === 'person') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className="shrink-0">
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c1.6-3.2 10.4-3.2 12 0" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'dropdown' || name === 'doc') {
    return <Icon d="M7 7h7l3 3v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />;
  }
  return <Icon d="M4 7h16M8 7v10M4 11h10" />;
}

export function ClickUpFieldRow({
  icon,
  label,
  children,
}: {
  icon: ClickUpFieldIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center min-h-10 border-b border-[#eceef1] gap-1 sm:gap-4 py-1.5 sm:py-0.5">
      <div className="sm:w-[240px] shrink-0 text-[#5c6370] flex items-center gap-2 text-[13px]">
        <span className="text-[#87909e]"><ClickUpFieldIcon name={icon} /></span>
        <span className="leading-snug">{label}</span>
      </div>
      <div className="flex-1 min-w-0 text-[13px] text-[#292d34]">{children}</div>
    </div>
  );
}
