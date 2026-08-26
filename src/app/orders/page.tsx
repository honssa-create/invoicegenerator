'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import NestieeProcessingDashboard from '@/components/NestieeProcessingDashboard';
import {
  ORDER_TYPES,
  STATUS_COLORS,
  getOrderType,
  isOrderUnshipped,
  isOrderUrgent,
  orderDueDate,
  orderListPaymentStatus,
  orderMatchesTypeFilter,
  orderStatusFamily,
  statusKeyForTypeFilter,
  statusesForOrderType,
  summarizeOrderDashboard,
  summarizeOrderListProducts,
  type Order,
} from '@/lib/orders';
import {
  isNestieeOrdersFilter,
  type NestieeProcessingDemand,
} from '@/lib/nestiee-order-demand';
import { displayOrderNumber } from '@/lib/record-numbering-core';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

const EMPTY_NESTIEE_DEMAND: NestieeProcessingDemand = {
  giftBoxes: [],
  bottles: [],
  processingOrderCount: 0,
};

const OrdersBoard = dynamic(() => import('@/components/OrdersBoard'), { ssr: false });
const OrdersCalendar = dynamic(() => import('@/components/OrdersCalendar'), { ssr: false });

type SortKey = 'reference' | 'order' | 'type' | 'status' | 'delivery' | 'created';
type DashFocus = 'all' | 'unshipped' | 'urgent';
type OrdersView = 'line' | 'board' | 'calendar';
const PAGE_SIZE = 50;
const ORDERS_LIST_UI_KEY = 'orders-list-ui';
const SORT_KEYS: SortKey[] = ['reference', 'order', 'type', 'status', 'delivery', 'created'];
const VIEWS: OrdersView[] = ['line', 'board', 'calendar'];
const DASH_FOCUSES: DashFocus[] = ['all', 'unshipped', 'urgent'];

type OrdersListUiState = {
  view: OrdersView;
  dateStart: string;
  dateEnd: string;
  orderType: string;
  status: string;
  search: string;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  dashFocus: DashFocus;
  page: number;
};

function readOrdersListUi(): Partial<OrdersListUiState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ORDERS_LIST_UI_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrdersListUiState>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeOrdersListUi(state: OrdersListUiState) {
  try {
    sessionStorage.setItem(ORDERS_LIST_UI_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

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
  const savedUi = useMemo(() => readOrdersListUi(), []);
  const urlType = searchParams.get('type');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');

  const [dateStart, setDateStart] = useState(savedUi?.dateStart ?? '');
  const [dateEnd, setDateEnd] = useState(savedUi?.dateEnd ?? '');
  const [orderType, setOrderType] = useState(() =>
    urlType != null ? urlType.trim() : (savedUi?.orderType ?? '')
  );
  const [status, setStatus] = useState(savedUi?.status ?? '');
  const [search, setSearch] = useState(savedUi?.search ?? '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(() => {
    const key = savedUi?.sort?.key;
    const dir = savedUi?.sort?.dir;
    if (key && SORT_KEYS.includes(key) && (dir === 'asc' || dir === 'desc')) {
      return { key, dir };
    }
    return { key: 'reference', dir: 'desc' };
  });
  const [view, setView] = useState<OrdersView>(() =>
    savedUi?.view && VIEWS.includes(savedUi.view) ? savedUi.view : 'line'
  );
  const [boardError, setBoardError] = useState('');
  const [page, setPage] = useState(() => {
    const n = Number(savedUi?.page);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  });
  const [dashFocus, setDashFocus] = useState<DashFocus>(() =>
    savedUi?.dashFocus && DASH_FOCUSES.includes(savedUi.dashFocus) ? savedUi.dashFocus : 'all'
  );
  const skipPageResetRef = useRef(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [nestieeDemand, setNestieeDemand] = useState<NestieeProcessingDemand>(EMPTY_NESTIEE_DEMAND);
  const [nestieeDemandLoading, setNestieeDemandLoading] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<number>>(new Set());

  const isNestieeFilter = isNestieeOrdersFilter(orderType);

  const loadNestieeDemand = useCallback(() => {
    if (!isNestieeOrdersFilter(orderType)) return;
    setNestieeDemandLoading(true);
    fetch('/api/orders/nestiee-processing-demand')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.demand) setNestieeDemand(d.demand);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setNestieeDemandLoading(false));
  }, [orderType]);

  const load = () => {
    setLoading(true);
    fetch('/api/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => {
        setLoading(false);
        loadNestieeDemand();
      });
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    loadNestieeDemand();
  }, [loadNestieeDemand]);

  // Sidebar type shortcuts: /orders?type=<exact order type> wins over the last saved type.
  useEffect(() => {
    const raw = searchParams.get('type');
    if (raw == null) return;
    setOrderType(raw.trim());
  }, [searchParams]);

  useEffect(() => {
    writeOrdersListUi({
      view,
      dateStart,
      dateEnd,
      orderType,
      status,
      search,
      sort,
      dashFocus,
      page,
    });
  }, [view, dateStart, dateEnd, orderType, status, search, sort, dashFocus, page]);

  const setOrderTypeAndUrl = (value: string) => {
    setOrderType(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('type', value);
    else params.delete('type');
    const qs = params.toString();
    router.replace(qs ? `/orders?${qs}` : '/orders', { scroll: false });
  };

  const typeOptions = ORDER_TYPES;

  const statusOptions = useMemo(
    () => statusesForOrderType(statusKeyForTypeFilter(orderType)),
    [orderType],
  );

  useEffect(() => {
    if (status && !statusOptions.includes(status)) setStatus('');
  }, [status, statusOptions]);

  const scopedOrders = useMemo(() => {
    if (!orderType) return orders;
    return orders.filter((o) => orderMatchesTypeFilter(getOrderType(o), orderType));
  }, [orders, orderType]);

  const dashCounts = useMemo(() => summarizeOrderDashboard(scopedOrders), [scopedOrders]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) => {
      const created = o.created_at?.slice(0, 10) || '';
      if (dateStart && created && created < dateStart) return false;
      if (dateEnd && created && created > dateEnd) return false;
      if (orderType && !orderMatchesTypeFilter(getOrderType(o), orderType)) return false;
      if (status && o.status !== status) return false;
      if (dashFocus === 'unshipped' && !isOrderUnshipped(o)) return false;
      if (dashFocus === 'urgent' && !isOrderUrgent(o)) return false;
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
          base = (orderDueDate(a) || '').localeCompare(orderDueDate(b) || '');
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
  }, [orders, dateStart, dateEnd, orderType, status, search, sort, dashFocus]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const pageStart = displayed.length ? (page - 1) * PAGE_SIZE : 0;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, displayed.length);
  const pageRows = displayed.slice(pageStart, pageEnd);

  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedOrderIds.has(o.id)),
    [orders, selectedOrderIds],
  );

  const bulkSelectionFamilies = useMemo(() => {
    const families = new Set(selectedOrders.map((o) => orderStatusFamily(getOrderType(o))));
    return families;
  }, [selectedOrders]);

  const bulkStatusMixedTypes = bulkSelectionFamilies.size > 1;

  const bulkStatusOptions = useMemo(() => {
    if (!selectedOrders.length || bulkStatusMixedTypes) return [];
    return [...statusesForOrderType(getOrderType(selectedOrders[0]))];
  }, [selectedOrders, bulkStatusMixedTypes]);

  useEffect(() => {
    if (bulkStatus && bulkStatusOptions.length && !bulkStatusOptions.includes(bulkStatus)) {
      setBulkStatus('');
    }
  }, [bulkStatus, bulkStatusOptions]);

  const allPageRowsSelected = pageRows.length > 0 && pageRows.every((o) => selectedOrderIds.has(o.id));

  const toggleSelectOrder = (id: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPageRows = () => {
    setSelectedOrderIds((prev) => {
      if (allPageRowsSelected) {
        const next = new Set(prev);
        pageRows.forEach((o) => next.delete(o.id));
        return next;
      }
      return new Set([...Array.from(prev), ...pageRows.map((o) => o.id)]);
    });
  };

  const clearOrderSelection = () => {
    setSelectedOrderIds(new Set());
    setBulkStatus('');
  };

  useEffect(() => {
    if (skipPageResetRef.current) {
      skipPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [dateStart, dateEnd, orderType, status, search, sort, dashFocus]);

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
    setDashFocus('all');
    router.replace('/orders', { scroll: false });
  };

  const dashCards: Array<{
    key: DashFocus;
    title: string;
    value: number;
    subtitle: string;
    icon: string;
    color: string;
    ring: string;
  }> = [
    {
      key: 'unshipped',
      title: bi('Unshipped', '未寄出訂單'),
      value: dashCounts.unshipped,
      subtitle: bi('Not yet sent', '尚未寄出'),
      icon: '📦',
      color: 'bg-amber-50 text-amber-700',
      ring: 'ring-amber-500',
    },
    {
      key: 'all',
      title: bi('Current orders', '現有訂單'),
      value: dashCounts.total,
      subtitle: bi('All in scope', '目前範圍內全部'),
      icon: '📋',
      color: 'bg-blue-50 text-blue-700',
      ring: 'ring-blue-500',
    },
    {
      key: 'urgent',
      title: bi('Urgent', '緊急訂單'),
      value: dashCounts.urgent,
      subtitle: bi('Due within 2 days', '兩天內到期'),
      icon: '🚨',
      color: 'bg-red-50 text-red-700',
      ring: 'ring-red-500',
    },
  ];

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

  const patchOrderStatus = async (
    orderId: number,
    nextStatus: string,
    prevStatus: string,
    opts?: { quiet?: boolean },
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ core: { status: nextStatus } }),
      });
      if (!res.ok) {
        setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: prevStatus } : o)));
        if (!opts?.quiet) {
          const data = await res.json().catch(() => ({}));
          setBoardError(data.error || bi('Failed to update status', '無法更新狀態'));
        }
        return false;
      }
      loadNestieeDemand();
      return true;
    } catch {
      setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: prevStatus } : o)));
      if (!opts?.quiet) {
        setBoardError(bi('Failed to update status', '無法更新狀態'));
      }
      return false;
    }
  };

  const changeOrderStatus = async (orderId: number, nextStatus: string): Promise<boolean> => {
    const prev = orders.find((o) => o.id === orderId)?.status;
    if (prev == null || prev === nextStatus) return true;
    setBoardError('');
    setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    return patchOrderStatus(orderId, nextStatus, prev);
  };

  const bulkChangeOrderStatus = async () => {
    if (!bulkStatus || bulkStatusMixedTypes || bulkUpdating) return;
    const targets = selectedOrders.filter((o) => o.status !== bulkStatus);
    if (!targets.length) {
      clearOrderSelection();
      return;
    }
    setBulkUpdating(true);
    setBoardError('');
    const prevById = new Map(targets.map((o) => [o.id, o.status]));
    const targetIds = targets.map((o) => o.id);
    setOrders((list) =>
      list.map((o) => (targetIds.includes(o.id) ? { ...o, status: bulkStatus } : o)),
    );
    const results = await Promise.allSettled(
      targets.map((o) => patchOrderStatus(o.id, bulkStatus, prevById.get(o.id) || o.status, { quiet: true })),
    );
    const failed = results.filter((r) => r.status === 'fulfilled' && r.value === false).length
      + results.filter((r) => r.status === 'rejected').length;
    const succeeded = targets.length - failed;
    setBulkUpdating(false);
    loadNestieeDemand();
    if (failed === 0) {
      clearOrderSelection();
    } else if (succeeded > 0) {
      setBoardError(
        bi(
          `Updated ${succeeded} order(s); ${failed} failed.`,
          `已更新 ${succeeded} 張訂單；${failed} 張失敗。`,
        ),
      );
    } else {
      setBoardError(bi('Failed to update selected orders', '無法更新所選訂單'));
    }
  };

  const toggleExpandedOrder = (id: number) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectCls = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  const LINE_TABLE_COL_COUNT = 8;

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {dashCards.map((card) => {
          const active = dashFocus === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setDashFocus(card.key)}
              className={`text-left bg-white rounded-xl border border-gray-200 p-6 transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                active ? `ring-2 ${card.ring}` : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {loading ? '—' : String(card.value)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${card.color}`}>
                  {card.icon}
                </div>
              </div>
            </button>
          );
        })}
      </div>

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

      {isNestieeFilter && (
        <NestieeProcessingDashboard
          demand={nestieeDemand}
          loading={loading || nestieeDemandLoading}
        />
      )}

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
            onStatusChange={changeOrderStatus}
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="text-gray-600">
                  Showing {pageStart + 1}–{pageEnd} of {displayed.length}
                </div>
                {selectedOrderIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-700 font-medium">
                      {bi(`${selectedOrderIds.size} selected`, `已選 ${selectedOrderIds.size} 張`)}
                    </span>
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                      disabled={bulkStatusMixedTypes || bulkUpdating}
                      className={`${selectCls} min-w-[10rem] disabled:opacity-50`}
                      aria-label={bi('Bulk status', '批量狀態')}
                    >
                      <option value="">{bi('Change status…', '更改狀態…')}</option>
                      {bulkStatusOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { void bulkChangeOrderStatus(); }}
                      disabled={!bulkStatus || bulkStatusMixedTypes || bulkUpdating}
                      className="px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 text-xs font-medium"
                    >
                      {bulkUpdating ? bi('Updating…', '更新中…') : bi('Apply', '套用')}
                    </button>
                    <button
                      type="button"
                      onClick={clearOrderSelection}
                      disabled={bulkUpdating}
                      className="text-xs text-gray-500 hover:text-gray-800 underline disabled:opacity-40"
                    >
                      {bi('Clear', '清除')}
                    </button>
                    {bulkStatusMixedTypes && (
                      <span className="text-xs text-amber-700">
                        {bi(
                          'Select orders of the same type to bulk-change status',
                          '請選擇相同類型的訂單以批量更改狀態',
                        )}
                      </span>
                    )}
                  </div>
                )}
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
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-2 py-3 w-10" aria-label={bi('More info', '詳細')} />
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={allPageRowsSelected}
                      onChange={toggleSelectAllPageRows}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      aria-label={bi('Select all on page', '全選本頁')}
                    />
                  </th>
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
                  <OrderLineRow
                    key={o.id}
                    order={o}
                    expanded={expandedOrderIds.has(o.id)}
                    selected={selectedOrderIds.has(o.id)}
                    colSpan={LINE_TABLE_COL_COUNT}
                    onToggleExpand={() => toggleExpandedOrder(o.id)}
                    onToggleSelect={() => toggleSelectOrder(o.id)}
                    onStatusChange={(orderId, nextStatus) => { void changeOrderStatus(orderId, nextStatus); }}
                  />
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

function OrderLineRow({
  order,
  expanded,
  selected,
  colSpan,
  onToggleExpand,
  onToggleSelect,
  onStatusChange,
}: {
  order: Order;
  expanded: boolean;
  selected: boolean;
  colSpan: number;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onStatusChange: (orderId: number, nextStatus: string) => void;
}) {
  const products = summarizeOrderListProducts(order);
  const paymentStatus = orderListPaymentStatus(order);
  const trackingNo = String(order.fields.tracking_no ?? '').trim();
  const address = order.shipping_address?.trim() || '';

  return (
    <Fragment>
      <tr className={`hover:bg-gray-50 ${selected ? 'bg-brand-50/40' : ''}`}>
        <td className="px-2 py-4">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs"
            title={expanded ? bi('Hide details', '隱藏詳細') : bi('More info', '詳細資料')}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </td>
        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            aria-label={bi(
              `Select ${displayOrderNumber(order.po_number) || order.reference_number}`,
              `選取 ${displayOrderNumber(order.po_number) || order.reference_number}`,
            )}
          />
        </td>
        <td className="px-6 py-4">
          <Link href={`/orders/${order.id}`} className="font-mono text-brand-600 hover:text-brand-700 font-medium text-sm">
            {order.reference_number}
          </Link>
        </td>
        <td className="px-6 py-4">
          <Link href={`/orders/${order.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">
            {displayOrderNumber(order.po_number) || '—'}
          </Link>
          {order.name && <p className="mt-0.5 text-xs text-gray-400">{order.name}</p>}
        </td>
        <td className="px-6 py-4 text-sm text-gray-600">{getOrderType(order) || '—'}</td>
        <td className="px-6 py-4">
          <OrderLineStatusSelect order={order} onChange={onStatusChange} />
        </td>
        <td className="px-6 py-4 text-sm text-gray-500">{orderDueDate(order) || '—'}</td>
        <td className="px-6 py-4 text-sm text-gray-400">{order.created_at?.slice(0, 10)}</td>
      </tr>
      {expanded ? (
        <tr className="bg-gray-50/80">
          <td colSpan={colSpan} className="px-4 py-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 ml-9">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1">訂購產品</p>
                  {products.length ? (
                    <ul className="space-y-1 text-gray-800">
                      {products.map((line, i) => (
                        <li key={`${line.name}-${i}`}>
                          {line.name}
                          {line.quantity ? (
                            <span className="text-gray-500"> × {line.quantity}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-400">—</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1">地址</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{address || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1">tracking number</p>
                  <p className="font-mono text-gray-800 break-all">{trackingNo || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1">payment status</p>
                  <p className="text-gray-800 font-medium">{paymentStatus}</p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function OrderLineStatusSelect({
  order,
  onChange,
}: {
  order: Order;
  onChange: (orderId: number, nextStatus: string) => void;
}) {
  const orderType = getOrderType(order);
  const statusOptions = statusesForOrderType(orderType);
  const statusList = statusOptions.includes(order.status)
    ? statusOptions
    : [order.status, ...statusOptions];

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <select
        value={order.status}
        onChange={(e) => onChange(order.id, e.target.value)}
        aria-label={bi('Status', '狀態')}
        className={`appearance-none text-xs font-medium rounded-full pl-2.5 pr-7 py-0.5 border-0 cursor-pointer outline-none focus:ring-2 focus:ring-brand-500/40 ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'}`}
      >
        {statusList.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70">▾</span>
    </div>
  );
}
