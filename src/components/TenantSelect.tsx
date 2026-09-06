'use client';

import { useEffect, useRef, useState } from 'react';
import type { RentalTenant } from '@/lib/rentals';
import { bi } from '@/lib/ui-labels';

interface TenantSelectProps {
  value: string;
  onSelect: (tenant: RentalTenant) => void;
  onAddNew: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function tenantMatchesQuery(t: RentalTenant, q: string): boolean {
  const hay = [t.name, t.contact_name, t.company_name, t.email, t.phone, t.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function tenantHint(t: RentalTenant): string {
  const parts = [t.company_name, t.contact_name, t.email].filter(Boolean);
  return parts.join(' · ');
}

export default function TenantSelect({
  value,
  onSelect,
  onAddNew,
  placeholder,
  disabled = false,
  className = '',
}: TenantSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (disabled) {
      setTenants([]);
      return;
    }
    setLoading(true);
    fetch('/api/rentals/tenants')
      .then((res) => res.json())
      .then((data) => setTenants(data.tenants || []))
      .catch(() => setTenants([]))
      .finally(() => setLoading(false));
  }, [disabled]);

  const q = query.trim();
  const filtered = q ? tenants.filter((t) => tenantMatchesQuery(t, q)) : tenants;
  const exactNameMatch = tenants.some((t) => t.name.toLowerCase() === q.toLowerCase());

  const pick = (t: RentalTenant) => {
    onSelect(t);
    setOpen(false);
    setQuery('');
  };

  const triggerCls =
    'w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm text-left bg-white';

  if (disabled) {
    return (
      <div className={`${triggerCls} bg-gray-50 text-gray-700 cursor-not-allowed ${className}`}>
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || '—'}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerCls}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder || bi('Select or add tenant…', '選擇或新增租客…')}
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
                  if (q && !exactNameMatch) onAddNew(q);
                  else if (filtered[0]) pick(filtered[0]);
                }
              }}
              placeholder={bi('Search tenants…', '搜尋租客…')}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('Loading…', '載入中…')}</div>
            )}
            {!loading && filtered.length === 0 && !q && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('No tenants yet', '尚無租客')}</div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 ${
                  t.name === value ? 'text-brand-700 font-medium bg-brand-50/60' : 'text-gray-700'
                }`}
              >
                <div>{t.name}</div>
                {tenantHint(t) && (
                  <div className="text-xs text-gray-500 truncate">{tenantHint(t)}</div>
                )}
              </button>
            ))}
            {q && !exactNameMatch && (
              <button
                type="button"
                onClick={() => {
                  onAddNew(q);
                  setOpen(false);
                  setQuery('');
                }}
                className="w-full text-left px-3 py-2 text-sm text-brand-700 font-medium hover:bg-brand-50 border-t border-gray-100"
              >
                + {bi('Add', '新增')} &quot;{q}&quot;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
