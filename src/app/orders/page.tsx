'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import {
  ORDER_NAV_TYPE_FILTERS,
  ORDER_TYPES,
  STATUS_COLORS,
  getOrderType,
  orderMatchesTypeFilter,
  statusKeyForTypeFilter,
  statusesForOrderType,
  type Order,
} from '@/lib/orders';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

const OrdersBoard = dynamic(() => import('@/components/OrdersBoard'), { ssr: false });
const OrdersCalendar = dynamic(() => import('@/components/OrdersCalendar'), { ssr: false });

type SortKey = 'reference' | 'order' | 'type' | 'status' | 'delivery' | 'created';
const PAGE_SIZE = 50;

export default function OrdersPage() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-100 rounded-lg" />
            <div className="h-64 bg-gray-100 rounded-xl" />
          </div>
        }
      >
        <OrdersPageContent />
      </Suspense>
    </AppLayout>
  );
}

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [orderType, setOrderType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'reference', dir: 'desc' });
  const [view, setView] = useState<'line' | 'board' | 'calendar'>('line');
  const [boardError, setBoardError] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    fetch('/api/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Sidebar type shortcuts: /orders?type=honour|wedding|nestiee (or exact type)
  useEffect(() => {
    const raw = searchParams.get('type')?.trim() || '';
    setOrderType(raw);
  }, [searchParams]);

  const setOrderTypeAndUrl = (value: string) => {
    setOrderType(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('type', value);
    else params.delete('type');
    const qs = params.toString();
    router.replace(qs ? `/orders?${qs}` : '/orders', { scroll: false });
  };

  const typeOptions = useMemo(() => {
    const fromData = orders.map(getOrderType).filter(Boolean);
    return Array.from(new Set([...ORDER_TYPES, ...fromData]));
  }, [orders]);

  const statusOptions = useMemo(
    () => statusesForOrderType(statusKeyForTypeFilter(orderType)),
    [orderType],
  );

  useEffect(() => {
    if (status && !statusOptions.includes(status)) setStatus('');
  }, [status, statusOptions]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) => {
      const created = o.created_at?.slice(0, 10) || '';
      if (dateStart && created && created < dateStart) return false;
      if (dateEnd && created && created > dateEnd) return false;
      if (orderType && !orderMatchesTypeFilter(getOrderType(o), orderType)) return false;
      if (status && o.status !== status) return false;
      if (q) {
        const hay = [o.reference_number, o.po_number, o.name, o.description, getOrderType(o)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let base: number;
      switch (sort.key) {
        case 'type':
          base = getOrderType(a).localeCompare(getOrderType(b), 'zh');
          break;
        case 'status':
          base = (a.status || '').localeCompare(b.status || '', 'zh');
          break;
        case 'delivery':
          base = (a.delivery_date || '').localeCompare(b.delivery_date || '');
          break;
        case 'order':
          base = (a.po_number || '').localeCompare(b.po_number || '', 'zh');
          break;
        case 'reference':
          base = a.reference_number.localeCompare(b.reference_number);
          break;
        default:
          base = (a.created_at || '').localeCompare(b.created_at || '');
      }
      return dir * base || b.id - a.id;
    });
    return list;
  }, [orders, dateStart, dateEnd, orderType, status, search, sort]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const pageStart = displayed.length ? (page - 1) * PAGE_SIZE : 0;
  const pageEnd = Math.min(page * PAGE_SIZE, displayed.length);
  const pageRows = displayed.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(1);
  }, [dateStart, dateEnd, orderType, status, search, sort]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'reference' || key === 'created' || key === 'delivery' ? 'desc' : 'asc' }
    );
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕');
  const sortTh = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-6 py-3 cursor-pointer select-none whitespace-nowrap hover:text-gray-700 ${sort.key === key ? 'text-brand-700' : ''}`}
    >
      {label}
      <span className="text-gray-400">{arrow(key)}</span>
    </th>
  );

  const clearFilters = () => {
    setDateStart('');
    setDateEnd('');
    setOrderType('');
    setStatus('');
    setSearch('');
    router.replace('/orders', { scroll: false });
  };

  const create = async (status?: string) => {
    if (creating) return;
    setCreating(true);
    setCreatingStatus(status || null);
    setCreateError('');
    setBoardError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status ? { status } : {}),
      });
      const data = await res.json();
      if (!res.ok || !data.order?.id) {
        setCreateError(data.error || bi('Failed to create order', '無法建立訂單'));
        return;
      }
      router.push(`/orders/${data.order.id}`);
    } catch {
      setCreateError(bi('Failed to create order', '無法建立訂單'));
    } finally {
      setCreating(false);
      setCreatingStatus(null);
    }
  };

  const changeBoardStatus = async (orderId: number, nextStatus: string): Promise<boolean> => {
    const prev = orders.find((o) => o.id === orderId)?.status;
    if (prev == null || prev === nextStatus) return true;
    setBoardError('');
    setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ core: { status: nextStatus } }),
      });
      if (!res.ok) {
        setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: prev } : o)));
        const data = await res.json().catch(() => ({}));
        setBoardError(data.error || bi('Failed to update status', '無法更新狀態'));
        return false;
      }
      return true;
    } catch {
      setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: prev } : o)));
      setBoardError(bi('Failed to update status', '無法更新狀態'));
      return false;
    }
  };

  const selectCls = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.orders}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('Manage production orders with a ClickUp-style detail view', '以 ClickUp 風格詳情頁管理生產訂單')}</p>
        </div>
        <div className="page-actions">
          <div className="inline-flex rounded-lg border border-gray-300 p-0.5 text-sm bg-white">
            <button
              type="button"
              onClick={() => setView('line')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                view === 'line' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {bi('Line', '列表')}
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                view === 'board' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {bi('Board', '看板')}
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                view === 'calendar' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {bi('Calendar', '日曆')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { void create(); }}
            disabled={creating}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            + {creating ? BTN.creating : bi('New Order', '新增訂單')}
          </button>
        </div>
      </div>

      {(createError || boardError) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {createError || boardError}
        </div>
      )}

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={bi('Search reference, PO#, name, description, type…', '搜尋參考編號、PO#、客戶、描述、類型…')}
        onClear={clearFilters}
      >
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Order Type', '訂單類型')}</label>
          <select value={orderType} onChange={(e) => setOrderTypeAndUrl(e.target.value)} className={selectCls}>
            <option value="">{BTN.all}</option>
            {ORDER_NAV_TYPE_FILTERS.map((f) => (
              <option key={f.param} value={f.param}>{f.label}</option>
            ))}
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Status', '狀態')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">{BTN.all}</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </FilterBar>

      {view === 'board' ? (
        loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <OrdersBoard
            orders={displayed}
            statuses={statusOptions}
            onStatusChange={changeBoardStatus}
            onCreateInStatus={(status) => { void create(status); }}
            creatingStatus={creatingStatus}
          />
        )
      ) : view === 'calendar' ? (
        loading ? (
          <div className="bg-white rounded-xl border border-gray-200 h-96 animate-pulse" />
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            {bi('No orders yet. Create your first order.', '尚無訂單。建立第一張訂單。')}
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            {bi('No orders match your filters.', '沒有符合篩選條件的訂單。')}
          </div>
        ) : (
          <OrdersCalendar orders={displayed} />
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {loading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">{bi('No orders yet. Create your first order.', '尚無訂單。建立第一張訂單。')}</div>
          ) : displayed.length === 0 ? (
            <div className="p-12 text-center text-gray-500">{bi('No orders match your filters.', '沒有符合篩選條件的訂單。')}</div>
          ) : (
            <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 text-sm">
              <div className="text-gray-600">
                Showing {pageStart + 1}–{pageEnd} of {displayed.length}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
                >
                  ← Prev
                </button>
                <span className="text-xs text-gray-500">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
                >
                  Next →
                </button>
              </div>
            </div>
            <div className="table-scroll">
            <table className="w-full min-w-[840px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  {sortTh('reference', bi('Reference Number', '參考編號'))}
                  {sortTh('order', bi('Order Number', '訂單號碼'))}
                  {sortTh('type', bi('Order Type', '訂單類型'))}
                  {sortTh('status', bi('Status', '狀態'))}
                  {sortTh('delivery', bi('Delivery', '交貨'))}
                  {sortTh('created', bi('Created', '建立'))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link href={`/orders/${o.id}`} className="font-mono text-brand-600 hover:text-brand-700 font-medium text-sm">
                        {o.reference_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/orders/${o.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">
                        {o.po_number || '—'}
                      </Link>
                      {o.name && <p className="mt-0.5 text-xs text-gray-400">{o.name}</p>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{getOrderType(o) || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-700'}`}>{o.status}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{o.delivery_date || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{o.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {displayed.length > PAGE_SIZE && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm">
                <div className="text-gray-600">
                  Showing {pageStart + 1}–{pageEnd} of {displayed.length}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500">
                    Page {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      )}
    </>
  );
}
