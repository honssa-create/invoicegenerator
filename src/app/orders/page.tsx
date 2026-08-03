'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { ORDER_STATUSES, ORDER_TYPES, STATUS_COLORS, type Order } from '@/lib/orders';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type SortKey = 'reference' | 'order' | 'type' | 'status' | 'delivery' | 'created';

function getOrderType(o: Order): string {
  const t = o.fields?.order_type;
  return typeof t === 'string' ? t : '';
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [orderType, setOrderType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'reference', dir: 'desc' });

  const load = () => {
    setLoading(true);
    fetch('/api/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const typeOptions = useMemo(() => {
    const fromData = orders.map(getOrderType).filter(Boolean);
    return Array.from(new Set([...ORDER_TYPES, ...fromData]));
  }, [orders]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) => {
      const created = o.created_at?.slice(0, 10) || '';
      if (dateStart && created && created < dateStart) return false;
      if (dateEnd && created && created > dateEnd) return false;
      if (orderType && getOrderType(o) !== orderType) return false;
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
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
    }
  };

  const selectCls = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.orders}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('Manage production orders with a ClickUp-style detail view', '以 ClickUp 風格詳情頁管理生產訂單')}</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            + {creating ? BTN.creating : bi('New Order', '新增訂單')}
          </button>
        </div>
      </div>

      {createError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {createError}
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
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className={selectCls}>
            <option value="">{BTN.all}</option>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Status', '狀態')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">{BTN.all}</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{bi('No orders yet. Create your first order.', '尚無訂單。建立第一張訂單。')}</div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{bi('No orders match your filters.', '沒有符合篩選條件的訂單。')}</div>
        ) : (
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
              {displayed.map((o) => (
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
        )}
      </div>
    </AppLayout>
  );
}
