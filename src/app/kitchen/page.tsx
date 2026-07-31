'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import {
  GIFT_BOX_TYPES,
  RAW_MATERIALS,
  expandGiftBoxBom,
  checkBomAgainstStock,
  bomIsSufficient,
  formatStockStatus,
  formatRawQty,
  finishedSkuLabel,
  bomLineKey,
  normalizeBomQty,
  SUI_XIN_YAN_BING_G,
  SUI_XIN_BING_TANG_G,
  type KitchenState,
  type KitchenOpenOrder,
  type KitchenNeedLine,
} from '@/lib/kitchen';
import { FINISHED_SKUS, type StockMaps } from '@/lib/kitchen-bom';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type Modal = 'gift' | 'return' | 'restock' | null;

function tickKey(orderId: number, needKey: string) {
  return `${orderId}::${needKey}`;
}

/** Stock reserved by temporary ticks (excludes `excludeTickKey` if provided). */
function reservedByTempTicks(
  orders: KitchenOpenOrder[],
  tempTicks: Record<string, boolean>,
  excludeTickKey?: string
): { finished: Record<string, number>; raw: Record<string, number>; giftBoxes: Record<string, number> } {
  const finished: Record<string, number> = {};
  const raw: Record<string, number> = {};
  const giftBoxes: Record<string, number> = {};
  for (const o of orders) {
    if (o.fullyFulfilled) continue;
    for (const n of o.needs) {
      if (n.done || n.remaining <= 0) continue;
      const key = tickKey(o.id, n.needKey);
      if (!tempTicks[key] || key === excludeTickKey) continue;
      if (n.needKey.startsWith('gift:')) {
        // Nestiee needs pull from packaged gift-box stock (not unfinished bottles).
        const boxType = n.needKey.slice('gift:'.length);
        giftBoxes[boxType] = (giftBoxes[boxType] || 0) + n.remaining;
      } else if (n.needKey.startsWith('bottle:')) {
        const sku = n.needKey.slice('bottle:'.length);
        finished[sku] = (finished[sku] || 0) + n.remaining;
      }
    }
  }
  return { finished, raw, giftBoxes };
}

function stockAfterReservation(
  stock: StockMaps,
  reserved: { finished: Record<string, number>; raw: Record<string, number>; giftBoxes?: Record<string, number> }
): StockMaps {
  const finished = { ...stock.finished };
  const raw = { ...stock.raw };
  const giftBoxes = { ...stock.giftBoxes };
  for (const [sku, qty] of Object.entries(reserved.finished)) {
    finished[sku] = (finished[sku] || 0) - qty;
  }
  for (const [name, qty] of Object.entries(reserved.raw)) {
    raw[name] = (raw[name] || 0) - qty;
  }
  for (const [boxType, qty] of Object.entries(reserved.giftBoxes || {})) {
    giftBoxes[boxType] = (giftBoxes[boxType] || 0) - qty;
  }
  return { finished, raw, giftBoxes };
}

function isNeedStockEnough(n: KitchenNeedLine, stock: StockMaps): boolean {
  if (n.done || n.remaining <= 0) return true;
  if (n.needKey.startsWith('gift:')) {
    const boxType = n.needKey.slice('gift:'.length);
    return (stock.giftBoxes[boxType] || 0) >= n.remaining;
  }
  if (n.needKey.startsWith('bottle:')) {
    const sku = n.needKey.slice('bottle:'.length);
    return (stock.finished[sku] || 0) >= n.remaining;
  }
  return false;
}

export default function KitchenPage() {
  const [state, setState] = useState<KitchenState | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  /** Temporary checklist ticks before confirming order complete. */
  const [tempTicks, setTempTicks] = useState<Record<string, boolean>>({});
  const [completeOrder, setCompleteOrder] = useState<KitchenOpenOrder | null>(null);

  // 包裝禮盒
  const [giftType, setGiftType] = useState(GIFT_BOX_TYPES[0]?.id || 'star_gold');
  const [giftQty, setGiftQty] = useState(1);
  const [giftOrderId, setGiftOrderId] = useState<number | null>(null);
  /** Packaging consume overrides (bomLineKey → input string). Reset when type/qty change. */
  const [packageConsume, setPackageConsume] = useState<Record<string, string>>({});

  // 包裝回禮
  const [returnOrderId, setReturnOrderId] = useState<number | ''>('');
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});

  // 補充原料 / 成品
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [finishedInputs, setFinishedInputs] = useState<Record<string, string>>({});

  const load = () =>
    fetch('/api/kitchen/state')
      .then((r) => r.json())
      .then((d) => setState(d.state));

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const flash = (text: string, kind: 'success' | 'error' = 'success') => setToast({ text, kind });

  const stockMaps = useMemo(() => {
    if (!state) return { finished: {}, raw: {}, giftBoxes: {} };
    const finished: Record<string, number> = {};
    const raw: Record<string, number> = {};
    const giftBoxes: Record<string, number> = {};
    for (const f of state.finished) finished[f.sku] = f.quantity;
    for (const r of state.raw) raw[r.name] = r.quantity;
    for (const g of state.giftBoxes) giftBoxes[g.boxType] = g.quantity;
    return { finished, raw, giftBoxes };
  }, [state]);

  /** 現有 after temporary order ticks (prevents double allocation on the product lists). */
  const availableStockMaps = useMemo(() => {
    if (!state) return stockMaps;
    return stockAfterReservation(stockMaps, reservedByTempTicks(state.openOrders, tempTicks));
  }, [state, stockMaps, tempTicks]);

  const tempReserved = useMemo(() => {
    if (!state) {
      return {
        finished: {} as Record<string, number>,
        raw: {} as Record<string, number>,
        gift: {} as Record<string, number>,
      };
    }
    const m = reservedByTempTicks(state.openOrders, tempTicks);
    return { finished: m.finished, raw: m.raw, gift: m.giftBoxes };
  }, [state, tempTicks]);

  // Drop temporary ticks that are no longer coverable by current stock.
  useEffect(() => {
    if (!state) return;
    setTempTicks((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!next[key]) continue;
        const sep = key.indexOf('::');
        if (sep < 0) continue;
        const orderId = Number(key.slice(0, sep));
        const needKey = key.slice(sep + 2);
        const order = state.openOrders.find((o) => o.id === orderId);
        const need = order?.needs.find((n) => n.needKey === needKey);
        if (!need || need.done || order?.fullyFulfilled) {
          delete next[key];
          changed = true;
          continue;
        }
        const reserved = reservedByTempTicks(state.openOrders, next, key);
        const available = stockAfterReservation(stockMaps, reserved);
        if (!isNeedStockEnough(need, available)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state, stockMaps]);

  const giftBomLines = useMemo(() => expandGiftBoxBom(giftType, giftQty), [giftType, giftQty]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const line of giftBomLines) {
      next[bomLineKey(line)] = String(line.qty);
    }
    setPackageConsume(next);
  }, [giftBomLines]);

  const effectiveGiftBomLines = useMemo(() => {
    return giftBomLines.map((line) => {
      const key = bomLineKey(line);
      const parsed = Number(packageConsume[key]);
      const qty = Number.isFinite(parsed) ? normalizeBomQty(line, parsed) : line.qty;
      return line.kind === 'finished'
        ? { kind: 'finished' as const, sku: line.sku, qty }
        : { kind: 'raw' as const, name: line.name, qty };
    });
  }, [giftBomLines, packageConsume]);

  const giftChecks = useMemo(
    () => checkBomAgainstStock(effectiveGiftBomLines, availableStockMaps),
    [effectiveGiftBomLines, availableStockMaps]
  );
  const giftPackageOk = bomIsSufficient(giftChecks);
  const giftAllocateOk =
    giftQty > 0 && (availableStockMaps.giftBoxes[giftType] || 0) >= giftQty;
  const giftOk = giftOrderId != null ? giftAllocateOk : giftPackageOk;

  const returnOrders = state?.openOrders.filter((o) => o.type === 'return_gift' && !o.fullyFulfilled) || [];
  const selectedReturn = returnOrders.find((o) => o.id === Number(returnOrderId));

  const returnChecks = useMemo(() => {
    if (!selectedReturn) return [];
    return selectedReturn.needs
      .filter((n) => n.remaining > 0)
      .map((n) => {
        const sku = n.needKey.slice('bottle:'.length);
        const have = availableStockMaps.finished[sku] || 0;
        const makeQty = returnQtys[n.needKey] ?? 0;
        return {
          needKey: n.needKey,
          label: finishedSkuLabel(sku),
          remaining: n.remaining,
          makeQty,
          have,
          enough: have >= makeQty,
          maxMake: Math.min(n.remaining, have),
        };
      });
  }, [selectedReturn, availableStockMaps, returnQtys]);

  const returnOk =
    returnChecks.some((c) => c.makeQty > 0) &&
    returnChecks.every((c) => c.makeQty >= 0 && c.makeQty <= c.remaining && c.enough);

  const initReturnQtys = (order?: KitchenOpenOrder | null) => {
    const o = order || null;
    const next: Record<string, number> = {};
    if (o) {
      for (const n of o.needs) {
        if (n.remaining > 0) next[n.needKey] = n.remaining;
      }
    }
    setReturnQtys(next);
  };

  const openGift = (order?: KitchenOpenOrder, boxType?: string) => {
    if (order?.type === 'nestiee') {
      setGiftOrderId(order.id);
      const pending = order.needs.find((n) => !n.done && n.needKey.startsWith('gift:'));
      if (boxType) setGiftType(boxType);
      else if (pending) setGiftType(pending.needKey.slice(5));
      const rem = pending?.remaining || 1;
      setGiftQty(Math.max(1, rem));
    } else {
      setGiftOrderId(null);
      setGiftQty(1);
    }
    setModal('gift');
  };

  const openReturn = (order?: KitchenOpenOrder) => {
    const id = order?.id || returnOrders[0]?.id || '';
    const selected = order || returnOrders.find((o) => o.id === id) || null;
    setReturnOrderId(id);
    initReturnQtys(selected);
    setModal('return');
  };

  const openRestock = () => {
    setRawInputs({});
    setFinishedInputs({});
    setModal('restock');
  };

  const clearOrderTicks = (orderId: number) => {
    setTempTicks((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${orderId}::`)) delete next[key];
      }
      return next;
    });
  };

  const toggleNeedTick = (order: KitchenOpenOrder, need: KitchenNeedLine) => {
    if (need.done || order.fullyFulfilled || busy) return;
    const key = tickKey(order.id, need.needKey);
    const currentlyTicked = Boolean(tempTicks[key]);
    // When ticking on, stock must cover this line after other reservations.
    if (!currentlyTicked) {
      const reserved = reservedByTempTicks(state?.openOrders || [], tempTicks);
      const available = stockAfterReservation(stockMaps, reserved);
      if (!isNeedStockEnough(need, available)) {
        flash(bi('Not enough stock to mark this item', '庫存不足，無法標記此項目'), 'error');
        return;
      }
    }
    setTempTicks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const pending = order.needs.filter((n) => !n.done && n.remaining > 0);
      const allTicked =
        pending.length > 0 && pending.every((n) => next[tickKey(order.id, n.needKey)]);
      if (allTicked) {
        queueMicrotask(() => setCompleteOrder(order));
      }
      return next;
    });
  };

  const confirmCompleteOrder = async () => {
    if (!completeOrder || !state) return;
    const order = completeOrder;
    const pending = order.needs.filter((n) => !n.done && n.remaining > 0);

    // Re-check stock for the whole order before deducting.
    let probe: StockMaps = stockMaps;
    for (const n of pending) {
      if (!isNeedStockEnough(n, probe)) {
        flash(bi('Not enough stock to complete this order', '庫存不足，無法完成此訂單'), 'error');
        setCompleteOrder(null);
        return;
      }
      if (n.needKey.startsWith('gift:')) {
        const boxType = n.needKey.slice('gift:'.length);
        probe = stockAfterReservation(probe, {
          finished: {},
          raw: {},
          giftBoxes: { [boxType]: n.remaining },
        });
      } else if (n.needKey.startsWith('bottle:')) {
        const sku = n.needKey.slice('bottle:'.length);
        probe = stockAfterReservation(probe, {
          finished: { [sku]: n.remaining },
          raw: {},
          giftBoxes: {},
        });
      }
    }

    setBusy(true);
    try {
      if (order.type === 'return_gift') {
        const res = await fetch('/api/kitchen/make-return-gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            lines: pending.map((n) => ({ needKey: n.needKey, qty: n.remaining })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          flash(data.error || 'Failed', 'error');
          return;
        }
        setState(data.state);
      } else {
        let latest = state;
        for (const n of pending) {
          const boxType = n.needKey.slice('gift:'.length);
          const res = await fetch('/api/kitchen/allocate-gift-box', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              boxType,
              quantity: n.remaining,
              orderId: order.id,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            flash(data.error || 'Failed', 'error');
            if (data.state) setState(data.state);
            else if (latest) setState(latest);
            return;
          }
          latest = data.state;
          setState(data.state);
        }
      }
      clearOrderTicks(order.id);
      setCompleteOrder(null);
      flash(bi(`Order ${order.poNumber} completed`, `訂單 ${order.poNumber} 已完成`));
    } finally {
      setBusy(false);
    }
  };

  const submitGift = async () => {
    setBusy(true);
    try {
      const endpoint = giftOrderId
        ? '/api/kitchen/allocate-gift-box'
        : '/api/kitchen/make-gift-box';
      const consumeOverrides: Record<string, number> = {};
      if (!giftOrderId) {
        for (const line of effectiveGiftBomLines) {
          consumeOverrides[bomLineKey(line)] = line.qty;
        }
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxType: giftType,
          quantity: giftQty,
          orderId: giftOrderId,
          ...(giftOrderId ? {} : { consumeOverrides }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      setModal(null);
      flash(
        giftOrderId
          ? bi('Gift boxes allocated', '禮盒已分配')
          : bi('Gift box packaged', '禮盒已包裝')
      );
    } finally {
      setBusy(false);
    }
  };

  const submitReturn = async () => {
    if (!returnOrderId) return;
    const lines = returnChecks
      .filter((c) => c.makeQty > 0)
      .map((c) => ({ needKey: c.needKey, qty: c.makeQty }));
    setBusy(true);
    try {
      const res = await fetch('/api/kitchen/make-return-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: Number(returnOrderId), lines }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      setModal(null);
      flash(bi('Return gift packaged', '回禮已包裝'));
    } finally {
      setBusy(false);
    }
  };

  const submitRestock = async () => {
    const deltas = Object.entries(rawInputs)
      .map(([name, v]) => ({ name, qty: Number(v) }))
      .filter((d) => Number.isFinite(d.qty) && d.qty !== 0);
    const finishedDeltas = Object.entries(finishedInputs)
      .map(([sku, v]) => ({ sku, qty: Number(v) }))
      .filter((d) => Number.isFinite(d.qty) && d.qty !== 0);
    setBusy(true);
    try {
      const res = await fetch('/api/kitchen/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltas, finishedDeltas }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      setModal(null);
      flash(bi('Stock updated', '庫存已更新'));
    } finally {
      setBusy(false);
    }
  };

  const voidMovement = async (id: number, actionLabel: string) => {
    if (!confirm(bi(`Cancel ${actionLabel}?`, `確定取消「${actionLabel}」？`))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/kitchen/movements/${id}/void`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      flash(bi(`Cancelled: ${actionLabel}`, `已取消：${actionLabel}`));
    } finally {
      setBusy(false);
    }
  };

  const giftNeededTotal = state?.giftBoxes.reduce((s, g) => s + g.needed, 0) || 0;
  const returnNeededCount = returnOrders.length;

  const inputCls =
    'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  const shortfall = (have: number, need: number) =>
    need > have ? 'text-red-600 font-semibold' : 'text-green-600';

  if (!state) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppLayout>
    );
  }

  const currentGiftHave =
    availableStockMaps.giftBoxes[giftType] ??
    state.giftBoxes.find((g) => g.boxType === giftType)?.quantity ??
    0;
  const currentGiftNeed = Math.max(
    0,
    (state.giftBoxes.find((g) => g.boxType === giftType)?.needed || 0) -
      (tempReserved.gift[giftType] || 0)
  );

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.kitchen}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi('Gift boxes · finished bottles · raw · order fulfillment', '禮盒 · 成品樽 · 原料 · 訂單履約')}
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            toast.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Inventory */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{bi('Gift boxes', '禮盒庫存')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">禮盒</th>
                  <th className="py-2 pr-2 text-right">現有</th>
                  <th className="py-2 text-right">需要</th>
                </tr>
              </thead>
              <tbody>
                {state.giftBoxes.map((g) => {
                  const have = availableStockMaps.giftBoxes[g.boxType] ?? g.quantity;
                  const needed = Math.max(0, g.needed - (tempReserved.gift[g.boxType] || 0));
                  return (
                  <tr key={g.boxType} className="border-b border-gray-50">
                    <td className="py-2 pr-2">{g.label}</td>
                    <td className="py-2 pr-2 text-right font-medium">{have}</td>
                    <td className={`py-2 text-right ${shortfall(have, needed)}`}>{needed}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-1">
          <h2 className="font-semibold text-gray-900 mb-3">{bi('Finished bottles', '成品樽')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">容量/口味</th>
                  <th className="py-2 pr-2 text-right">現有</th>
                  <th className="py-2 text-right">需要</th>
                </tr>
              </thead>
              <tbody>
                {state.finished.map((f) => {
                  const have = availableStockMaps.finished[f.sku] ?? f.quantity;
                  const needed = Math.max(0, f.needed - (tempReserved.finished[f.sku] || 0));
                  return (
                  <tr key={f.sku} className="border-b border-gray-50">
                    <td className="py-2 pr-2">{f.label}</td>
                    <td className="py-2 pr-2 text-right font-medium">{have}</td>
                    <td className={`py-2 text-right ${shortfall(have, needed)}`}>{needed}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{bi('Raw materials', '原料')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">原料</th>
                  <th className="py-2 pr-2 text-right">現有</th>
                  <th className="py-2 text-right">需要</th>
                </tr>
              </thead>
              <tbody>
                {state.raw.map((r) => {
                  const have = availableStockMaps.raw[r.name] ?? r.quantity;
                  const needed = Math.max(0, r.needed - (tempReserved.raw[r.name] || 0));
                  return (
                  <tr key={r.name} className="border-b border-gray-50">
                    <td className="py-2 pr-2">
                      {r.name}
                      <span className="text-gray-400 text-xs ml-1">{r.unit}</span>
                    </td>
                    <td className="py-2 pr-2 text-right font-medium">{formatRawQty(have, r.unit)}</td>
                    <td className={`py-2 text-right ${shortfall(have, needed)}`}>
                      {formatRawQty(needed, r.unit)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          type="button"
          onClick={() => openGift()}
          className="relative px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700"
        >
          包裝禮盒
          {giftNeededTotal > 0 && (
            <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
              {giftNeededTotal}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => openReturn()}
          className="relative px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700"
        >
          包裝回禮
          {returnNeededCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">
              {returnNeededCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={openRestock}
          className="px-4 py-3 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700"
        >
          補充原料
        </button>
      </div>

      {/* Orders + History */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{bi('Orders', '訂單')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">PO #</th>
                  <th className="py-2 pr-2">類型</th>
                  <th className="py-2 pr-2">需要</th>
                  <th className="py-2">分配</th>
                </tr>
              </thead>
              <tbody>
                {state.openOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-400">
                      {bi('No open Nestiee / 回禮 needs', '沒有待製作的 Nestiee / 回禮')}
                    </td>
                  </tr>
                )}
                {state.openOrders.map((o) => (
                  <tr
                    key={o.id}
                    className={`border-b border-gray-50 align-top ${
                      o.fullyFulfilled ? 'bg-green-50/40 opacity-80' : ''
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium">
                      <div>
                        <Link
                          href={`/orders/${o.id}`}
                          className="text-brand-600 hover:text-brand-700 hover:underline"
                        >
                          {o.poNumber}
                        </Link>
                      </div>
                      {o.fullyFulfilled && (
                        <span className="text-xs font-normal text-green-700">已完成</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">{o.typeLabel}</td>
                    <td className="py-2 pr-2">
                      <ul className="space-y-1">
                        {o.needs.map((n) => {
                          const reserved = reservedByTempTicks(
                            state.openOrders,
                            tempTicks,
                            tickKey(o.id, n.needKey)
                          );
                          const available = stockAfterReservation(stockMaps, reserved);
                          const enough = isNeedStockEnough(n, available);
                          const temp = Boolean(tempTicks[tickKey(o.id, n.needKey)]);
                          const checked = n.done || temp;
                          return (
                            <li key={n.needKey} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded disabled:opacity-40"
                                checked={checked}
                                disabled={n.done || o.fullyFulfilled || busy || (!enough && !temp)}
                                title={
                                  n.done || o.fullyFulfilled
                                    ? bi('Already fulfilled', '已完成')
                                    : enough
                                      ? bi('Mark as prepared', '標記為已備妥')
                                      : bi('Not enough stock', '庫存不足')
                                }
                                onChange={() => toggleNeedTick(o, n)}
                              />
                              <span
                                className={
                                  n.done
                                    ? 'text-gray-400 line-through'
                                    : temp
                                      ? 'text-green-700'
                                      : !enough
                                        ? 'text-gray-400'
                                        : ''
                                }
                              >
                                {n.label}
                              </span>
                              {!n.done && n.remaining < n.required && (
                                <span className="text-xs text-amber-600">剩 {n.remaining}</span>
                              )}
                              {!n.done && !enough && (
                                <span className="text-xs text-red-500">庫存不足</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td className="py-2">
                      {o.fullyFulfilled ? (
                        <span className="text-xs text-green-700">已分配</span>
                      ) : (
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50"
                          onClick={() => (o.type === 'nestiee' ? openGift(o) : openReturn(o))}
                        >
                          分配
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{bi('History', '歷史')}</h2>
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">日子/時間</th>
                  <th className="py-2 pr-2">動作</th>
                  <th className="py-2 pr-2">詳細</th>
                  <th className="py-2 pr-2">用戶</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {state.movements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      {bi('No movements yet', '尚無紀錄')}
                    </td>
                  </tr>
                )}
                {state.movements.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-gray-50 align-top ${m.voidedAt ? 'opacity-50' : ''}`}
                  >
                    <td className="py-2 pr-2 whitespace-nowrap text-xs text-gray-600">{m.createdAt}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {m.actionLabel}
                      {m.voidedAt && (
                        <span className="block text-xs text-red-500">已取消</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs whitespace-pre-line">
                      {m.summary.replace(/，/g, '\n')}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{m.createdByName}</td>
                    <td className="py-2 whitespace-nowrap">
                      {state.isAdmin && !m.voidedAt && m.action !== 'void' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => voidMovement(m.id, m.actionLabel)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            {modal === 'gift' && (
              <>
                <h3 className="text-lg font-semibold mb-4">
                  {giftOrderId ? '分配禮盒' : '包裝禮盒'}
                </h3>
                <label className="block text-sm text-gray-600 mb-1">禮盒種類</label>
                <select
                  className={`${inputCls} w-full mb-3`}
                  value={giftType}
                  onChange={(e) => setGiftType(e.target.value)}
                >
                  {GIFT_BOX_TYPES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <label className="block text-sm text-gray-600 mb-1">
                  {giftOrderId ? '分配數量' : '包裝數量'}
                </label>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg border"
                    onClick={() => setGiftQty((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    className={`${inputCls} w-20 text-center`}
                    value={giftQty}
                    onChange={(e) => setGiftQty(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg border"
                    onClick={() => setGiftQty((q) => q + 1)}
                  >
                    +
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-gray-500 text-xs">禮盒現有</div>
                    <div className="text-xl font-semibold">{currentGiftHave}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-gray-500 text-xs">應備數量</div>
                    <div className="text-xl font-semibold">{currentGiftNeed}</div>
                  </div>
                </div>
                {giftOrderId && (
                  <p className="text-xs text-gray-500 mb-3">連結訂單 #{giftOrderId}</p>
                )}
                {giftOrderId ? (
                  <div className="border rounded-lg p-3 mb-4 space-y-2 text-sm">
                    <div className="font-medium text-gray-700">從已包裝禮盒庫存扣除</div>
                    <div className="flex items-baseline gap-3">
                      <span className="flex-1 min-w-0">
                        −{GIFT_BOX_TYPES.find((g) => g.id === giftType)?.label || giftType}
                      </span>
                      <span className="tabular-nums text-right w-16 shrink-0 font-medium">{giftQty}</span>
                      <span
                        className={`tabular-nums text-right w-24 shrink-0 ${
                          giftAllocateOk ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {currentGiftHave} / {giftAllocateOk ? '足夠' : '不足'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-3 mb-4 space-y-2 text-sm">
                    <div className="font-medium text-gray-700">消耗（包裝用成品樽/原料）</div>
                    {giftType.startsWith('sui_xin') && (
                      <p className="text-xs text-gray-500">
                        預設換算：每份頂級乾燕餅 = {SUI_XIN_YAN_BING_G}g 燕餅、每份燕窩冰糖 ={' '}
                        {SUI_XIN_BING_TANG_G}g 冰糖。可因批次誤差調整實際消耗。
                      </p>
                    )}
                    {!giftType.startsWith('sui_xin') && (
                      <p className="text-xs text-gray-500">可調整實際消耗數量後再確認包裝。</p>
                    )}
                    {giftChecks.map((c) => {
                      const unit =
                        c.kind === 'raw'
                          ? RAW_MATERIALS.find((m) => m.name === c.key)?.unit || 'g'
                          : '個';
                      const lineKey =
                        c.kind === 'finished' ? `finished:${c.key}` : `raw:${c.key}`;
                      const step = unit === 'g' ? '0.001' : '1';
                      return (
                        <div key={c.key} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0">−{c.label}</span>
                          <input
                            type="number"
                            min={0}
                            step={step}
                            className={`${inputCls} w-24 text-right tabular-nums`}
                            value={packageConsume[lineKey] ?? String(c.need)}
                            onChange={(e) =>
                              setPackageConsume((prev) => ({
                                ...prev,
                                [lineKey]: e.target.value,
                              }))
                            }
                          />
                          <span className="text-xs text-gray-400 w-6 shrink-0">{unit}</span>
                          <span
                            className={`tabular-nums text-right w-24 shrink-0 ${
                              c.enough ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {formatStockStatus(c, unit)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" className="px-4 py-2 rounded-lg border" onClick={() => setModal(null)}>
                    {BTN.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={!giftOk || busy}
                    onClick={submitGift}
                    className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-40"
                  >
                    {BTN.confirm}
                  </button>
                </div>
              </>
            )}

            {modal === 'return' && (
              <>
                <h3 className="text-lg font-semibold mb-4">包裝回禮</h3>
                <label className="block text-sm text-gray-600 mb-1">PO #</label>
                <select
                  className={`${inputCls} w-full mb-4`}
                  value={returnOrderId}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : '';
                    setReturnOrderId(id);
                    initReturnQtys(returnOrders.find((o) => o.id === id) || null);
                  }}
                >
                  <option value="">—</option>
                  {returnOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.poNumber}
                    </option>
                  ))}
                </select>
                {returnOrders.length === 0 && (
                  <p className="text-sm text-gray-500 mb-4">{bi('No open 回禮 orders', '沒有待包裝回禮')}</p>
                )}
                <div className="border rounded-lg p-3 mb-4 space-y-3 text-sm">
                  <div className="font-medium text-gray-700">包裝數量</div>
                  {returnChecks.map((c) => (
                    <div key={c.needKey} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0">−{c.label}</span>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg border shrink-0"
                          onClick={() =>
                            setReturnQtys((prev) => ({
                              ...prev,
                              [c.needKey]: Math.max(0, (prev[c.needKey] ?? 0) - 1),
                            }))
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={c.remaining}
                          className={`${inputCls} w-16 text-center tabular-nums`}
                          value={c.makeQty}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(c.remaining, Math.floor(Number(e.target.value) || 0)));
                            setReturnQtys((prev) => ({ ...prev, [c.needKey]: v }));
                          }}
                        />
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg border shrink-0"
                          onClick={() =>
                            setReturnQtys((prev) => ({
                              ...prev,
                              [c.needKey]: Math.min(c.remaining, (prev[c.needKey] ?? 0) + 1),
                            }))
                          }
                        >
                          +
                        </button>
                        <span
                          className={`tabular-nums text-right w-24 shrink-0 ${
                            c.enough ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {c.have} / {c.enough ? '足夠' : '不足'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 pl-0">剩餘需要 {c.remaining}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="px-4 py-2 rounded-lg border" onClick={() => setModal(null)}>
                    {BTN.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={!returnOk || busy}
                    onClick={submitReturn}
                    className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-40"
                  >
                    {BTN.confirm}
                  </button>
                </div>
              </>
            )}

            {modal === 'restock' && (
              <>
                <h3 className="text-lg font-semibold mb-4">補充原料</h3>
                <div className="space-y-2 mb-4">
                  {RAW_MATERIALS.map((m) => (
                    <div key={m.name} className="flex items-center gap-3">
                      <label className="w-28 text-sm shrink-0">
                        {m.name}
                        <span className="text-gray-400 text-xs ml-1">{m.unit}</span>
                      </label>
                      <input
                        type="number"
                        step={m.unit === 'g' ? '0.001' : '1'}
                        className={`${inputCls} flex-1`}
                        placeholder="0"
                        value={rawInputs[m.name] || ''}
                        onChange={(e) => setRawInputs((prev) => ({ ...prev, [m.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {bi('Finished bottles (until brewing)', '成品樽（燉煮功能上線前）')}
                </h4>
                <div className="space-y-2 mb-4">
                  {FINISHED_SKUS.map((sku) => (
                    <div key={sku} className="flex items-center gap-3">
                      <label className="w-44 text-xs shrink-0">{finishedSkuLabel(sku)}</label>
                      <input
                        type="number"
                        className={`${inputCls} flex-1`}
                        placeholder="0"
                        value={finishedInputs[sku] || ''}
                        onChange={(e) =>
                          setFinishedInputs((prev) => ({ ...prev, [sku]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="px-4 py-2 rounded-lg border" onClick={() => setModal(null)}>
                    {BTN.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submitRestock}
                    className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-40"
                  >
                    {BTN.confirm}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {completeOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-2">
              {bi('Order ready', '訂單已備妥')}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              {bi(
                `All items for PO# ${completeOrder.poNumber} are marked. Confirm to deduct stock and mark this order done?`,
                `PO# ${completeOrder.poNumber} 的所需項目已全部勾選。確認後將扣除庫存並將此訂單標為完成？`
              )}
            </p>
            <ul className="border rounded-lg p-3 mb-4 space-y-1 text-sm max-h-48 overflow-y-auto">
              {completeOrder.needs
                .filter((n) => !n.done && n.remaining > 0)
                .map((n) => (
                  <li key={n.needKey} className="flex justify-between gap-2">
                    <span>{n.label}</span>
                    <span className="tabular-nums text-gray-500">×{n.remaining}</span>
                  </li>
                ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border"
                disabled={busy}
                onClick={() => setCompleteOrder(null)}
              >
                {BTN.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmCompleteOrder}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-40"
              >
                {bi('Mark done', '確認完成')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
