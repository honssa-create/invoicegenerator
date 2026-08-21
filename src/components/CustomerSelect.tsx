'use client';

import { useEffect, useRef, useState } from 'react';
import type { Customer } from '@/lib/types';
import { bi } from '@/lib/ui-labels';

interface CustomerSelectProps {
  value: string;
  orderType: string;
  onSelect: (customer: Customer) => void;
  onAddNew: (name: string) => void;
  placeholder?: string;
}

function customerMatchesQuery(c: Customer, q: string): boolean {
  const hay = [c.name, c.company_name, c.email, c.phone, c.ordered]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function customerHint(c: Customer): string {
  const parts = [c.ordered, c.company_name, c.email].filter(Boolean);
  return parts.join(' · ');
}

export default function CustomerSelect({
  value,
  orderType,
  onSelect,
  onAddNew,
  placeholder,
}: CustomerSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
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
    if (!orderType.trim()) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    fetch(`/api/customers?ordered=${encodeURIComponent(orderType.trim())}`)
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers || []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [orderType]);

  const q = query.trim();
  const filtered = q ? customers.filter((c) => customerMatchesQuery(c, q)) : customers;
  const exactNameMatch = customers.some((c) => c.name.toLowerCase() === q.toLowerCase());

  const pick = (c: Customer) => {
    onSelect(c);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm text-left bg-white"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder || bi('Select customer…', '選擇客戶…')}
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
              placeholder={
                orderType.trim()
                  ? bi('Search customers…', '搜尋客戶…')
                  : bi('Set order type first', '請先設定訂單類型')
              }
              disabled={!orderType.trim()}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {!orderType.trim() && (
              <div className="px-3 py-2 text-xs text-gray-400">
                {bi('Choose an order type to load matching customers.', '請先選擇訂單類型以載入客戶。')}
              </div>
            )}
            {orderType.trim() && loading && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('Loading…', '載入中…')}</div>
            )}
            {orderType.trim() && !loading && filtered.length === 0 && !q && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('No customers yet', '尚無客戶')}</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 ${
                  c.name === value ? 'text-brand-700 font-medium bg-brand-50/60' : 'text-gray-700'
                }`}
              >
                <div>{c.name}</div>
                {customerHint(c) && (
                  <div className="text-xs text-gray-500 truncate">{customerHint(c)}</div>
                )}
              </button>
            ))}
            {q && !exactNameMatch && orderType.trim() && (
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
