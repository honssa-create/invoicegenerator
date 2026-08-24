'use client';

import { useEffect, useRef, useState } from 'react';
import type { Customer } from '@/lib/types';
import { bi } from '@/lib/ui-labels';

interface CustomerSelectProps {
  value: string;
  /** When set, filter customers by order type. Omit to load all customers. */
  orderType?: string;
  /** When true, search is disabled until orderType is set. */
  requireOrderType?: boolean;
  onSelect: (customer: Customer) => void;
  placeholder?: string;
  disabled?: boolean;
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
  requireOrderType = false,
  onSelect,
  placeholder,
  disabled = false,
}: CustomerSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const orderTypeFilter = orderType?.trim() ?? '';
  const searchBlocked = requireOrderType && !orderTypeFilter;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setCreateError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (searchBlocked) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    const url = orderTypeFilter
      ? `/api/customers?ordered=${encodeURIComponent(orderTypeFilter)}`
      : '/api/customers';
    fetch(url)
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers || []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [orderTypeFilter, searchBlocked]);

  const q = query.trim();
  const filtered = q ? customers.filter((c) => customerMatchesQuery(c, q)) : customers;
  const exactNameMatch = customers.some((c) => c.name.toLowerCase() === q.toLowerCase());
  const canAdd = q && !exactNameMatch && !searchBlocked && !disabled;

  const pick = (c: Customer) => {
    onSelect(c);
    setOpen(false);
    setQuery('');
    setCreateError('');
  };

  const createCustomer = async () => {
    if (!canAdd || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: q,
          ordered: orderTypeFilter || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || bi('Failed to create customer', '無法新增客戶'));
        return;
      }
      const customer = data.customer as Customer;
      setCustomers((prev) => {
        if (prev.some((c) => c.id === customer.id)) return prev;
        return [customer, ...prev];
      });
      pick(customer);
    } catch {
      setCreateError(bi('Failed to create customer', '無法新增客戶'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm text-left bg-white disabled:bg-gray-50 disabled:text-gray-400"
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
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canAdd) void createCustomer();
                  else if (filtered[0]) pick(filtered[0]);
                }
              }}
              placeholder={
                searchBlocked
                  ? bi('Set order type first', '請先設定訂單類型')
                  : bi('Search customers…', '搜尋客戶…')
              }
              disabled={searchBlocked || disabled}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {searchBlocked && (
              <div className="px-3 py-2 text-xs text-gray-400">
                {bi('Choose an order type to load matching customers.', '請先選擇訂單類型以載入客戶。')}
              </div>
            )}
            {!searchBlocked && loading && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('Loading…', '載入中…')}</div>
            )}
            {!searchBlocked && !loading && filtered.length === 0 && !q && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('No customers yet', '尚無客戶')}</div>
            )}
            {!searchBlocked && !loading && filtered.length === 0 && q && !canAdd && (
              <div className="px-3 py-2 text-xs text-gray-400">{bi('No matches', '沒有符合的結果')}</div>
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
            {canAdd && (
              <button
                type="button"
                onClick={() => void createCustomer()}
                disabled={creating}
                className="w-full text-left px-3 py-2 text-sm text-brand-700 font-medium hover:bg-brand-50 border-t border-gray-100 disabled:opacity-60"
              >
                {creating
                  ? bi('Creating…', '新增中…')
                  : `+ ${bi('Add', '新增')} "${q}"`}
              </button>
            )}
            {createError && (
              <div className="px-3 py-2 text-xs text-red-600 border-t border-gray-100">{createError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
