'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ORDER_STATUSES,
  STATUS_COLORS,
  STATUS_COLUMN_BG,
  STATUS_COLUMN_ACCENT,
  STATUS_DOT_COLORS,
  computeOrderPaidTotal,
  getOrderType,
  type Order,
} from '@/lib/orders';
import { orderFileUrl } from '@/lib/image-url';
import { formatCurrency } from '@/lib/utils';
import { bi } from '@/lib/ui-labels';

type Props = {
  orders: Order[];
  statuses?: readonly string[];
  onStatusChange: (orderId: number, nextStatus: string) => Promise<boolean>;
  onCreateInStatus: (status: string) => void;
  creatingStatus?: string | null;
};

function cardTitle(o: Order): string {
  const po = o.po_number?.trim();
  const name = o.name?.trim();
  if (po && name) return `${po} — ${name}`;
  if (po) return po;
  if (name) return name;
  return o.reference_number;
}

function formatCompactDate(value: string | null | undefined): string {
  const raw = (value || '').trim().slice(0, 10);
  if (!raw) return '';
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMetaLine(o: Order): string {
  const delivery = formatCompactDate(o.delivery_date);
  if (delivery) return delivery;
  const created = (o.created_at || '').slice(0, 7);
  if (!created) return '';
  const d = new Date(`${created}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return created;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function StatusDot({ status, className = '' }: { status: string; className?: string }) {
  const color = STATUS_DOT_COLORS[status] || '#9CA3AF';
  if (status === 'OPEN') {
    return (
      <svg className={`shrink-0 ${className}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle
          cx="7"
          cy="7"
          r="5.25"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="2.2 1.8"
        />
      </svg>
    );
  }
  return (
    <svg className={`shrink-0 ${className}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.25" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="7" cy="7" r="2.1" fill={color} />
    </svg>
  );
}

function OrderCard({
  order,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  order: Order;
  dragging: boolean;
  onDragStart: (orderId: number) => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();
  const thumb = order.files.find((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.original_name || '')) || null;
  const orderType = getOrderType(order);
  const paid = computeOrderPaidTotal(order.fields || {});
  const meta = formatMetaLine(order);
  const delivery = formatCompactDate(order.delivery_date);
  const [didDrag, setDidDrag] = useState(false);

  return (
    <article
      draggable
      onDragStart={(e) => {
        setDidDrag(true);
        e.dataTransfer.setData('text/plain', String(order.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(order.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (didDrag) {
          setDidDrag(false);
          return;
        }
        router.push(`/orders/${order.id}`);
      }}
      className={`group cursor-pointer rounded-xl border border-gray-200/80 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
        dragging ? 'opacity-50' : ''
      }`}
    >
      {thumb && (
        <div className="aspect-[16/10] bg-gray-100 overflow-hidden border-b border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={orderFileUrl(thumb)}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{cardTitle(order)}</h3>
        {(orderType || paid > 0) && (
          <p className="text-xs text-gray-500 truncate">
            {[orderType || null, paid > 0 ? formatCurrency(paid) : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {meta && <p className="text-[11px] text-gray-400">{meta}</p>}
        <div className="flex items-center gap-3 pt-1 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1" title="Attachments">
            <PaperclipIcon className="text-gray-400" />
            {order.files.length}
          </span>
          <span className="inline-flex items-center gap-1" title="Delivery">
            <CalendarIcon className="text-gray-400" />
            {delivery || '—'}
          </span>
        </div>
      </div>
    </article>
  );
}

function ColumnMenu({
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
        onClick={() => {
          onToggleCollapse();
          onClose();
        }}
      >
        {collapsed
          ? bi('Expand', '展開')
          : bi('Collapse', '收合')}
      </button>
    </div>
  );
}

export default function OrdersBoard({
  orders,
  statuses = ORDER_STATUSES,
  onStatusChange,
  onCreateInStatus,
  creatingStatus = null,
}: Props) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menuStatus, setMenuStatus] = useState<string | null>(null);

  const fallbackStatus = statuses[0] || 'OPEN';

  const byStatus = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const s of statuses) map.set(s, []);
    const known = new Set(statuses);
    for (const o of orders) {
      const key = known.has(o.status) ? o.status : fallbackStatus;
      const list = map.get(key) || map.get(fallbackStatus)!;
      list.push(o);
    }
    return map;
  }, [orders, statuses, fallbackStatus]);

  const toggleCollapse = (status: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleDrop = async (status: string) => {
    if (draggingId == null || busyId != null) return;
    const order = orders.find((o) => o.id === draggingId);
    setDropStatus(null);
    if (!order || order.status === status) {
      setDraggingId(null);
      return;
    }
    setBusyId(draggingId);
    try {
      await onStatusChange(draggingId, status);
    } finally {
      setBusyId(null);
      setDraggingId(null);
    }
  };

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 min-w-min items-start">
        {statuses.map((status) => {
          const columnOrders = byStatus.get(status) || [];
          const isOver = dropStatus === status && draggingId != null;
          const isCollapsed = collapsed.has(status);
          const dropHandlers = {
            onDragOver: (e: DragEvent) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropStatus !== status) setDropStatus(status);
            },
            onDragLeave: () => {
              if (dropStatus === status) setDropStatus(null);
            },
            onDrop: (e: DragEvent) => {
              e.preventDefault();
              void handleDrop(status);
            },
          };

          if (isCollapsed) {
            return (
              <section
                key={status}
                {...dropHandlers}
                className={`w-11 shrink-0 rounded-xl border border-t-4 min-h-[200px] flex flex-col items-center ${
                  STATUS_COLUMN_BG[status] || 'bg-gray-100'
                } ${STATUS_COLUMN_ACCENT[status] || 'border-t-gray-400'} border-x-gray-200/80 border-b-gray-200/80 ${
                  isOver ? 'ring-2 ring-brand-400 ring-offset-1' : ''
                }`}
              >
                <div className="relative w-full flex justify-center pt-2">
                  <button
                    type="button"
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-white/60"
                    aria-label={bi('Column options', '欄位選項')}
                    aria-expanded={menuStatus === status}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuStatus((cur) => (cur === status ? null : status));
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                  {menuStatus === status && (
                    <ColumnMenu
                      collapsed
                      onToggleCollapse={() => toggleCollapse(status)}
                      onClose={() => setMenuStatus(null)}
                    />
                  )}
                </div>
                <button
                  type="button"
                  title={bi('Expand column', '展開欄位')}
                  onClick={() => toggleCollapse(status)}
                  className="flex-1 w-full flex flex-col items-center justify-start gap-2 px-1 py-3 cursor-pointer rounded-b-xl text-gray-700"
                >
                  <StatusDot status={status} className="scale-110" />
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold tabular-nums bg-white/80 border border-black/5"
                    style={{ color: STATUS_DOT_COLORS[status] || '#6B7280' }}
                  >
                    {columnOrders.length}
                  </span>
                  <span
                    className="text-[11px] font-medium whitespace-nowrap"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      color: STATUS_DOT_COLORS[status] || '#6B7280',
                    }}
                  >
                    {status}
                  </span>
                </button>
              </section>
            );
          }

          return (
            <section
              key={status}
              {...dropHandlers}
              className={`w-[280px] shrink-0 rounded-xl border border-t-4 ${
                STATUS_COLUMN_BG[status] || 'bg-gray-100'
              } ${STATUS_COLUMN_ACCENT[status] || 'border-t-gray-400'} border-x-gray-200/80 border-b-gray-200/80 ${
                isOver ? 'ring-2 ring-brand-400 ring-offset-1' : ''
              }`}
            >
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 max-w-[220px] px-2.5 py-1 rounded-full text-xs font-medium ${
                    STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <StatusDot status={status} />
                  <span className="truncate">{status}</span>
                  <span className="opacity-70 tabular-nums">{columnOrders.length}</span>
                </span>
                <div className="relative ml-auto">
                  <button
                    type="button"
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-white/60"
                    aria-label={bi('Column options', '欄位選項')}
                    aria-expanded={menuStatus === status}
                    onClick={() => setMenuStatus((cur) => (cur === status ? null : status))}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="5" cy="12" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="19" cy="12" r="1.5" />
                    </svg>
                  </button>
                  {menuStatus === status && (
                    <ColumnMenu
                      collapsed={false}
                      onToggleCollapse={() => toggleCollapse(status)}
                      onClose={() => setMenuStatus(null)}
                    />
                  )}
                </div>
              </header>
              <div className="px-2.5 pb-2 space-y-2.5 min-h-[80px] max-h-[calc(100vh-18rem)] overflow-y-auto">
                {columnOrders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    dragging={draggingId === o.id || busyId === o.id}
                    onDragStart={setDraggingId}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropStatus(null);
                    }}
                  />
                ))}
              </div>
              <div className="px-2.5 pb-3 pt-1">
                <button
                  type="button"
                  disabled={creatingStatus != null}
                  onClick={() => onCreateInStatus(status)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white/70 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-50"
                >
                  {creatingStatus === status ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  ) : (
                    <span className="text-base leading-none">+</span>
                  )}
                  {creatingStatus === status
                    ? bi('Creating…', '建立中…')
                    : bi('New order', '新增訂單')}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
