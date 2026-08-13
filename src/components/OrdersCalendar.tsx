'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  STATUS_COLORS,
  STATUS_DOT_COLORS,
  getOrderType,
  orderDueDate,
  type Order,
} from '@/lib/orders';
import { bi } from '@/lib/ui-labels';

type Props = {
  orders: Order[];
};

function cardTitle(o: Order): string {
  const po = o.po_number?.trim();
  const name = o.name?.trim();
  if (po && name) return `${po} — ${name}`;
  if (po) return po;
  if (name) return name;
  return o.reference_number;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Sunday-start week index 0–6. */
function startWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function OrdersCalendar({ orders }: Props) {
  const router = useRouter();
  const today = new Date();
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const byDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const due = orderDueDate(o);
      if (!due) continue;
      const list = map.get(due) || [];
      list.push(o);
      map.set(due, list);
    }
    return map;
  }, [orders]);

  const undated = useMemo(() => orders.filter((o) => !orderDueDate(o)), [orders]);

  const { year, month } = cursor;
  const totalDays = daysInMonth(year, month);
  const pad = startWeekday(year, month);
  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < pad; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });

  const weekdays = [
    bi('Sun', '日'),
    bi('Mon', '一'),
    bi('Tue', '二'),
    bi('Wed', '三'),
    bi('Thu', '四'),
    bi('Fri', '五'),
    bi('Sat', '六'),
  ];

  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="px-2.5 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{monthLabel(year, month)}</h2>
            <button
              type="button"
              onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
              className="text-xs px-2 py-1 rounded-md text-brand-700 hover:bg-brand-50"
            >
              {bi('Today', '今天')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="px-2.5 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {weekdays.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr">
          {cells.map((cell, idx) => {
            if (cell.day == null || !cell.iso) {
              return <div key={`e-${idx}`} className="min-h-[7.5rem] bg-gray-50/40 border-b border-r border-gray-100" />;
            }
            const dayOrders = byDate.get(cell.iso) || [];
            const isToday = cell.iso === todayIso;
            return (
              <div
                key={cell.iso}
                className={`min-h-[7.5rem] border-b border-r border-gray-100 p-1.5 align-top ${
                  isToday ? 'bg-brand-50/40' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday ? 'bg-brand-600 text-white' : 'text-gray-600'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {dayOrders.length > 0 && (
                    <span className="text-[10px] text-gray-400 tabular-nums">{dayOrders.length}</span>
                  )}
                </div>
                <div className="space-y-1 max-h-[6.5rem] overflow-y-auto">
                  {dayOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => router.push(`/orders/${o.id}`)}
                      title={`${cardTitle(o)} · ${o.status}`}
                      className={`w-full text-left rounded px-1.5 py-1 text-[11px] leading-tight truncate border-0 cursor-pointer hover:opacity-90 ${
                        STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                        style={{ backgroundColor: STATUS_DOT_COLORS[o.status] || '#9CA3AF' }}
                      />
                      {cardTitle(o)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            {bi('No due date', '未設到期日')}
            <span className="ml-2 text-xs font-normal text-gray-400">({undated.length})</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {undated.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => router.push(`/orders/${o.id}`)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
                  STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-700'
                }`}
              >
                <span className="font-medium truncate max-w-[12rem]">{cardTitle(o)}</span>
                {getOrderType(o) && (
                  <span className="text-[10px] opacity-70 truncate max-w-[6rem]">{getOrderType(o)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
