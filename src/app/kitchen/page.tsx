'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import KitchenAdminPanel from '@/components/KitchenAdminPanel';
import {
  giftBoxMinStock,
  giftBoxTopUpQty,
  KITCHEN_ACTIONS,
  KITCHEN_ACTION_LABELS,
  expandGiftBoxBom,
  checkBomAgainstStock,
  bomIsSufficient,
  formatStockStatus,
  formatRawQty,
  finishedSkuLabel,
  bomLineKey,
  normalizeBomQty,
  giftBoxBomNeedsBirdNestChoice,
  SUI_XIN_YAN_BING_G,
  SUI_XIN_BING_TANG_G,
  activeGiftBoxTypes,
  isReserveRawMaterial,
  isUntrackedStewIngredient,
  type KitchenCatalog,
  type KitchenFormulas,
  type KitchenAction,
  type KitchenState,
  type KitchenOpenOrder,
  type KitchenNeedLine,
} from '@/lib/kitchen';
import { resolveRawStockName, defaultGiftBoxGlassBottleStockName, BIRD_NEST_TYPES, BIRD_NEST_TYPE_LABELS, type BirdNestType } from '@/lib/kitchen-prep';
import { type StockMaps } from '@/lib/kitchen-bom';
import { buildKitchenPrepCreateHref, type PrepCapacity } from '@/lib/kitchen-prep';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type Modal = 'gift' | 'return' | 'restock' | null;

type AdjustStockMode = 'set' | 'add';

type AdjustStockTarget = {
  kind: 'raw' | 'finished' | 'gift_box';
  key: string;
  label: string;
  current: number;
  unit?: string;
};

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
  const router = useRouter();
  const [state, setState] = useState<KitchenState | null>(null);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const catalogBundleRef = useRef<{ catalog: KitchenCatalog; formulas: KitchenFormulas } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  /** Temporary checklist ticks before confirming order complete. */
  const [tempTicks, setTempTicks] = useState<Record<string, boolean>>({});
  const [completeOrder, setCompleteOrder] = useState<KitchenOpenOrder | null>(null);

  // 包裝禮盒
  const [giftType, setGiftType] = useState('star_gold');
  const [giftQty, setGiftQty] = useState(1);
  const [giftBirdNestType, setGiftBirdNestType] = useState<BirdNestType>('large');
  const [giftOrderId, setGiftOrderId] = useState<number | null>(null);
  /** Packaging consume overrides (bomLineKey → input string). Reset when type/qty change. */
  const [packageConsume, setPackageConsume] = useState<Record<string, string>>({});

  // 包裝回禮
  const [returnOrderId, setReturnOrderId] = useState<number | ''>('');
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});

  // 補充原料
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [historyActionFilter, setHistoryActionFilter] = useState<KitchenAction | ''>('');

  // Admin stock adjustment
  const [adjustStock, setAdjustStock] = useState<AdjustStockTarget | null>(null);
  const [adjustStockMode, setAdjustStockMode] = useState<AdjustStockMode>('set');
  const [adjustStockInput, setAdjustStockInput] = useState('');

  const giftBoxTypes = state ? activeGiftBoxTypes(state.catalog) : [];
  const rawMaterials = state?.catalog.rawMaterials || [];

  const mergeCatalogIntoState = (
    operational: Omit<KitchenState, 'catalog' | 'formulas' | 'movements'> & Partial<Pick<KitchenState, 'movements'>>,
    movements?: KitchenState['movements']
  ): KitchenState | null => {
    const bundle = catalogBundleRef.current;
    if (!bundle) return null;
    return {
      ...operational,
      catalog: bundle.catalog,
      formulas: bundle.formulas,
      movements: movements ?? operational.movements ?? [],
    } as KitchenState;
  };

  const loadMovements = async () => {
    setMovementsLoading(true);
    try {
      const res = await fetch('/api/kitchen/movements');
      const data = await res.json();
      if (!res.ok) return;
      setState((prev) => (prev ? { ...prev, movements: data.movements || [] } : prev));
    } finally {
      setMovementsLoading(false);
    }
  };

  const loadCore = async () => {
    const res = await fetch('/api/kitchen/state?lite=1');
    const data = await res.json();
    if (!res.ok) return;
    setState((prev) => {
      const merged = mergeCatalogIntoState(data.state, prev?.movements);
      if (merged) {
        const first = activeGiftBoxTypes(merged.catalog)[0]?.id;
        if (first) setGiftType((cur) => cur || first);
      }
      return merged ?? prev;
    });
  };

  const loadInitial = async () => {
    const [stateRes, catalogRes] = await Promise.all([
      fetch('/api/kitchen/state?lite=1'),
      fetch('/api/kitchen/catalog'),
    ]);
    const stateData = await stateRes.json();
    const catalogData = await catalogRes.json();
    if (!stateRes.ok || !catalogRes.ok) return;

    catalogBundleRef.current = {
      catalog: catalogData.catalog,
      formulas: catalogData.formulas,
    };
    const merged = mergeCatalogIntoState(stateData.state, []);
    if (merged) {
      setState(merged);
      const first = activeGiftBoxTypes(merged.catalog)[0]?.id;
      if (first) setGiftType((cur) => cur || first);
    }
    void loadMovements();
  };

  const load = async (opts?: { refreshMovements?: boolean }) => {
    await loadCore();
    if (opts?.refreshMovements !== false) {
      await loadMovements();
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const flash = (text: string, kind: 'success' | 'error' = 'success') => setToast({ text, kind });

  const openAdjustStock = (target: AdjustStockTarget) => {
    if (!state?.isAdmin || busy) return;
    setAdjustStock(target);
    setAdjustStockMode('set');
    setAdjustStockInput(String(target.current));
  };

  const closeAdjustStock = () => {
    setAdjustStock(null);
    setAdjustStockInput('');
  };

  const adjustStockPreview = useMemo(() => {
    if (!adjustStock || adjustStockInput.trim() === '') return null;
    const parsed = Number(adjustStockInput);
    if (!Number.isFinite(parsed)) return null;
    const next =
      adjustStockMode === 'set' ? parsed : adjustStock.current + parsed;
    if (!Number.isFinite(next)) return null;
    return next;
  }, [adjustStock, adjustStockMode, adjustStockInput]);

  const submitAdjustStock = async () => {
    if (!adjustStock || !state?.isAdmin || busy) return;
    const parsed = Number(adjustStockInput);
    if (adjustStockInput.trim() === '' || !Number.isFinite(parsed)) {
      flash(bi('Invalid quantity', '數量無效'), 'error');
      return;
    }
    const quantity =
      adjustStockMode === 'set' ? parsed : adjustStock.current + parsed;
    if (quantity < 0) {
      flash(bi('Quantity cannot be negative', '數量不可為負'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/kitchen/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: adjustStock.kind,
          key: adjustStock.key,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      closeAdjustStock();
      flash(bi('Stock adjusted', '庫存已調整'));
    } finally {
      setBusy(false);
    }
  };
  /** Ask to create a kitchen prep order when finished bottles are short for packaging. */
  const offerPrepFromFinishedShortfalls = (
    shortfalls: unknown,
    errorMessage?: string
  ): boolean => {
    if (!Array.isArray(shortfalls) || shortfalls.length === 0) return false;
    const lines = shortfalls
      .map((g: {
        capacity?: string;
        qtys?: { osmanthus?: number; red_date?: number; rock_sugar?: number };
      }) => ({
        capacity: g.capacity as PrepCapacity,
        qty_osmanthus: Number(g.qtys?.osmanthus) || 0,
        qty_red_date: Number(g.qtys?.red_date) || 0,
        qty_rock_sugar: Number(g.qtys?.rock_sugar) || 0,
      }))
      .filter(
        (l) =>
          l.capacity &&
          l.qty_osmanthus + l.qty_red_date + l.qty_rock_sugar > 0
      );
    if (!lines.length) return false;

    const summary = lines
      .map(
        (l) =>
          `${l.capacity}: 桂花${l.qty_osmanthus}/紅棗${l.qty_red_date}/冰糖${l.qty_rock_sugar}`
      )
      .join('；');
    const ok = confirm(
      bi(
        `${errorMessage || 'Not enough finished bottles to pack gift boxes.'}\n\nCreate a restock prep order for:\n${summary}?`,
        `${errorMessage || '成品樽不足，無法包裝禮盒。'}\n\n是否建立補充存貨備料單？\n${summary}`
      )
    );
    if (ok) {
      setModal(null);
      router.push(
        buildKitchenPrepCreateHref({ orderType: 'restock', lines })
      );
    } else if (errorMessage) {
      flash(errorMessage, 'error');
    }
    return true;
  };

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

  const giftBomLines = useMemo(
    () => expandGiftBoxBom(giftType, giftQty, state?.formulas?.giftBoxBoms),
    [giftType, giftQty, state?.formulas?.giftBoxBoms]
  );

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
    () => checkBomAgainstStock(effectiveGiftBomLines, availableStockMaps, { birdNestType: giftBirdNestType }),
    [effectiveGiftBomLines, availableStockMaps, giftBirdNestType]
  );
  const giftNeedsBirdNestChoice = useMemo(
    () => giftBoxBomNeedsBirdNestChoice(giftBomLines),
    [giftBomLines]
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
        clearOrderTicks(order.id);
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
      flash(bi(`Order ${order.referenceNumber} completed`, `訂單 ${order.referenceNumber} 已完成`));
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
          ...(giftOrderId ? {} : { consumeOverrides, birdNestType: giftBirdNestType }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (offerPrepFromFinishedShortfalls(data.finished_shortfalls, data.error)) {
          return;
        }
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

  const topUpGiftBox = async (boxType: string, quantity: number) => {
    const minStock = giftBoxMinStock(Boolean(state?.holidayMode));
    const topUp = giftBoxTopUpQty(quantity, minStock);
    if (topUp <= 0 || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/kitchen/make-gift-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxType, quantity: topUp, birdNestType: giftBirdNestType }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (offerPrepFromFinishedShortfalls(data.finished_shortfalls, data.error)) {
          return;
        }
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      flash(bi(`Topped up to ${minStock}`, `已補貨至 ${minStock}`));
    } finally {
      setBusy(false);
    }
  };

  const toggleHolidayMode = async () => {
    if (!state?.isAdmin || busy) return;
    const next = !state.holidayMode;
    setBusy(true);
    try {
      const res = await fetch('/api/kitchen/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holiday_mode: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Failed', 'error');
        return;
      }
      setState(data.state);
      flash(
        next
          ? bi('Holiday mode on — gift box min 20', '節日模式已開啟 — 禮盒最低庫存 20')
          : bi('Holiday mode off — gift box min 10', '節日模式已關閉 — 禮盒最低庫存 10')
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
    setBusy(true);
    try {
      const res = await fetch('/api/kitchen/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltas }),
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

  const filteredMovements = useMemo(() => {
    if (!state) return [];
    if (!historyActionFilter) return state.movements;
    return state.movements.filter((m) => m.action === historyActionFilter);
  }, [state, historyActionFilter]);

  const historyActionOptions = useMemo(
    () => KITCHEN_ACTIONS.filter((a) => a !== 'void'),
    []
  );

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
  const giftMinStock = giftBoxMinStock(Boolean(state.holidayMode));

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.kitchen}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi('Gift boxes · finished bottles · raw · order fulfillment', '禮盒 · 成品樽 · 原料 · 訂單履約')}
          </p>
        </div>
        {state.isAdmin && (
          <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
            <span className="text-sm font-medium text-gray-700">節日模式</span>
            <button
              type="button"
              role="switch"
              aria-checked={state.holidayMode}
              disabled={busy}
              onClick={toggleHolidayMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${
                state.holidayMode ? 'bg-brand-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  state.holidayMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs text-gray-500 tabular-nums">≥{giftMinStock}</span>
          </label>
        )}
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

      {state.isAdmin && (
        <KitchenAdminPanel
          state={state}
          busy={busy}
          onSaved={(next) => {
            catalogBundleRef.current = { catalog: next.catalog, formulas: next.formulas };
            setState(next);
          }}
          onError={(msg) => flash(msg, 'error')}
          onSuccess={(msg) => flash(msg, 'success')}
          onBusy={setBusy}
        />
      )}

      {/* Inventory */}
      {(() => {
        const lowBoxes = state.giftBoxes.filter((g) => giftBoxTopUpQty(g.quantity, giftMinStock) > 0);
        if (!lowBoxes.length) return null;
        return (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {bi(
              `Gift boxes below ${giftMinStock}: `,
              `禮盒低於 ${giftMinStock}：`
            )}
            {lowBoxes.map((g) => g.label).join('、')}
            {bi(
              ` — use Top up to restock${state.holidayMode ? ' (holiday mode)' : ''}.`,
              ` — 請用「補貨至${giftMinStock}」補充${state.holidayMode ? '（節日模式）' : ''}。`
            )}
          </div>
        );
      })()}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{bi('Gift boxes', '禮盒庫存')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">禮盒</th>
                  <th className="py-2 pr-2 text-right">庫存</th>
                  <th className="py-2 pr-2 text-right">需要</th>
                  <th className="py-2 text-right">{bi('Min', '最低')}</th>
                  {state.isAdmin && <th className="py-2 text-right">Admin</th>}
                </tr>
              </thead>
              <tbody>
                {state.giftBoxes.map((g) => {
                  const have = availableStockMaps.giftBoxes[g.boxType] ?? g.quantity;
                  const needed = Math.max(0, g.needed - (tempReserved.gift[g.boxType] || 0));
                  const topUp = giftBoxTopUpQty(g.quantity, giftMinStock);
                  const low = topUp > 0;
                  return (
                  <tr key={g.boxType} className={`border-b border-gray-50 ${low ? 'bg-amber-50/60' : ''}`}>
                    <td className="py-2 pr-2">{g.label}</td>
                    <td className={`py-2 pr-2 text-right font-medium ${low ? 'text-red-600' : ''}`}>{have}</td>
                    <td className={`py-2 pr-2 text-right ${shortfall(have, needed)}`}>{needed}</td>
                    <td className="py-2 text-right">
                      {low ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => topUpGiftBox(g.boxType, g.quantity)}
                          className="text-xs px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
                          title={bi(`Package ${topUp} to reach ${giftMinStock}`, `包裝 ${topUp} 個至 ${giftMinStock}`)}
                        >
                          {bi(`Top up +${topUp}`, `補貨至${giftMinStock} +${topUp}`)}
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">≥{giftMinStock}</span>
                      )}
                    </td>
                    {state.isAdmin && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            openAdjustStock({
                              kind: 'gift_box',
                              key: g.boxType,
                              label: g.label,
                              current: g.quantity,
                            })
                          }
                          className="text-xs text-brand-600 hover:underline disabled:opacity-40"
                        >
                          設定
                        </button>
                      </td>
                    )}
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
                  <th className="py-2 pr-2 text-right">庫存</th>
                  <th className="py-2 text-right">需要</th>
                  {state.isAdmin && <th className="py-2 text-right">Admin</th>}
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
                    {state.isAdmin && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            openAdjustStock({
                              kind: 'finished',
                              key: f.sku,
                              label: f.label,
                              current: f.quantity,
                            })
                          }
                          className="text-xs text-brand-600 hover:underline disabled:opacity-40"
                        >
                          設定
                        </button>
                      </td>
                    )}
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
                  <th className="py-2 pr-2 text-right">庫存</th>
                  <th className="py-2 pr-2 text-right">需要</th>
                  <th className="py-2 text-right">可用</th>
                  {state.isAdmin && <th className="py-2 text-right">Admin</th>}
                </tr>
              </thead>
              <tbody>
                {state.raw.filter((r) => !isReserveRawMaterial(r.name) && !isUntrackedStewIngredient(r.name) && r.name !== '燕餅' && r.name !== '玻璃燉瓶').map((r) => {
                  const have = availableStockMaps.raw[r.name] ?? r.quantity;
                  const needed = r.needed;
                  const available = have - needed;
                  return (
                  <tr key={r.name} className="border-b border-gray-50">
                    <td className="py-2 pr-2">
                      {r.name}
                      <span className="text-gray-400 text-xs ml-1">{r.unit}</span>
                    </td>
                    <td className="py-2 pr-2 text-right font-medium">{formatRawQty(have, r.unit)}</td>
                    <td className={`py-2 pr-2 text-right ${shortfall(have, needed)}`}>
                      {formatRawQty(needed, r.unit)}
                    </td>
                    <td className={`py-2 text-right font-medium ${available < 0 ? 'text-red-600' : ''}`}>
                      {formatRawQty(available < 0 ? 0 : available, r.unit)}
                    </td>
                    {state.isAdmin && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            openAdjustStock({
                              kind: 'raw',
                              key: r.name,
                              label: r.name,
                              current: r.quantity,
                              unit: r.unit,
                            })
                          }
                          className="text-xs text-brand-600 hover:underline disabled:opacity-40"
                        >
                          設定
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
                {state.raw.some((r) => isReserveRawMaterial(r.name)) && (
                  <tr aria-hidden>
                    <td colSpan={state.isAdmin ? 5 : 4} className="p-0 h-0 border-t-2 border-black" />
                  </tr>
                )}
                {state.raw.filter((r) => isReserveRawMaterial(r.name)).map((r) => {
                  const have = availableStockMaps.raw[r.name] ?? r.quantity;
                  const available = Math.max(0, have - r.needed);
                  return (
                  <tr key={r.name} className="border-b border-gray-50 bg-gray-50/40">
                    <td className="py-2 pr-2">
                      {r.name}
                      <span className="text-gray-400 text-xs ml-1">g</span>
                    </td>
                    <td className="py-2 pr-2 text-right text-gray-300">—</td>
                    <td className="py-2 pr-2 text-right text-gray-300">—</td>
                    <td className={`py-2 text-right font-medium ${available <= 0 ? 'text-gray-400' : ''}`}>
                      {formatRawQty(available, 'g')}
                    </td>
                    {state.isAdmin && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            openAdjustStock({
                              kind: 'raw',
                              key: r.name,
                              label: r.name,
                              current: r.quantity,
                              unit: r.unit,
                            })
                          }
                          className="text-xs text-brand-600 hover:underline disabled:opacity-40"
                        >
                          設定
                        </button>
                      </td>
                    )}
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
                          {o.referenceNumber}
                        </Link>
                        {o.poNumber && <span className="ml-2 text-xs text-gray-400">PO# {o.poNumber}</span>}
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold text-gray-900">{bi('History', '歷史')}</h2>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span>動作</span>
              <select
                className={`${inputCls} min-w-[9rem]`}
                value={historyActionFilter}
                onChange={(e) =>
                  setHistoryActionFilter((e.target.value || '') as KitchenAction | '')
                }
              >
                <option value="">{bi('All', '全部')}</option>
                {historyActionOptions.map((a) => (
                  <option key={a} value={a}>
                    {KITCHEN_ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
                {movementsLoading ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      {state.movements.length === 0
                        ? bi('No movements yet', '尚無紀錄')
                        : bi('No movements for this action', '此動作尚無紀錄')}
                    </td>
                  </tr>
                ) : (
                filteredMovements.map((m) => (
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
                ))
                )}
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
                  {giftBoxTypes.map((g) => (
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
                    <div className="text-gray-500 text-xs">禮盒庫存</div>
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
                {!giftOrderId && giftNeedsBirdNestChoice && (
                  <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1.5">燕餅類型 Bird&apos;s-nest type</label>
                    <div className="flex gap-2">
                      {BIRD_NEST_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setGiftBirdNestType(t)}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            giftBirdNestType === t
                              ? 'border-brand-600 bg-brand-50 text-brand-800'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {BIRD_NEST_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      配方使用燕餅時，包裝前選擇扣減大燕餅或細燕餅庫存。
                    </p>
                  </div>
                )}
                {giftOrderId ? (
                  <div className="border rounded-lg p-3 mb-4 space-y-2 text-sm">
                    <div className="font-medium text-gray-700">從已包裝禮盒庫存扣除</div>
                    <div className="flex items-baseline gap-3">
                      <span className="flex-1 min-w-0">
                        −{giftBoxTypes.find((g) => g.id === giftType)?.label || giftType}
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
                        {SUI_XIN_BING_TANG_G}g 冰糖；玻璃燉瓶 = {defaultGiftBoxGlassBottleStockName()}。
                        {giftNeedsBirdNestChoice ? ' 選擇燕餅類型後扣減對應庫存。' : ''}
                        可因批次誤差調整實際消耗。
                      </p>
                    )}
                    {!giftType.startsWith('sui_xin') && (
                      <p className="text-xs text-gray-500">可調整實際消耗數量後再確認包裝。</p>
                    )}
                    {giftChecks.map((c) => {
                      const unit =
                        c.kind === 'raw'
                          ? rawMaterials.find((m) => m.name === resolveRawStockName(c.key, giftBirdNestType))?.unit || 'g'
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
                      {o.referenceNumber}{o.poNumber ? ` · PO# ${o.poNumber}` : ''}
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
                  {rawMaterials.map((m) => (
                    <div key={m.name} className="flex items-center gap-3">
                      <label className="w-28 text-sm text-gray-700 shrink-0">
                        {m.name}
                        <span className="text-gray-400 text-xs ml-1">{m.unit}</span>
                      </label>
                      <input
                        type="number"
                        step={m.unit === 'g' ? '0.001' : '1'}
                        value={rawInputs[m.name] ?? ''}
                        onChange={(e) => setRawInputs((prev) => ({ ...prev, [m.name]: e.target.value }))}
                        placeholder="±"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
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

      {adjustStock && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-1">
              {bi('Adjust stock', '調整庫存')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {adjustStock.label}
              {adjustStock.unit ? (
                <span className="text-gray-400 ml-1">({adjustStock.unit})</span>
              ) : null}
            </p>

            <p className="text-sm text-gray-500 mb-3">
              {bi('Current stock', '目前庫存')}:{' '}
              <span className="font-medium text-gray-800 tabular-nums">
                {adjustStock.unit
                  ? formatRawQty(adjustStock.current, adjustStock.unit)
                  : adjustStock.current}
              </span>
            </p>

            <div className="flex rounded-lg border border-gray-200 p-0.5 mb-4">
              <button
                type="button"
                onClick={() => {
                  setAdjustStockMode('set');
                  setAdjustStockInput(String(adjustStock.current));
                }}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  adjustStockMode === 'set'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {bi('Set absolute', '設定絕對數量')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdjustStockMode('add');
                  setAdjustStockInput('');
                }}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  adjustStockMode === 'add'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {bi('Add amount', '加減數量')}
              </button>
            </div>

            <label className="block text-sm text-gray-600 mb-1">
              {adjustStockMode === 'set'
                ? bi('New stock level', '新庫存量')
                : bi('Amount to add (use − to subtract)', '加減數量（減少請用 −）')}
            </label>
            <input
              type="number"
              step={adjustStock.unit === 'g' ? '0.001' : '1'}
              className={`${inputCls} w-full mb-2 tabular-nums`}
              value={adjustStockInput}
              onChange={(e) => setAdjustStockInput(e.target.value)}
              autoFocus
            />
            {adjustStockPreview != null && (
              <p
                className={`text-sm mb-4 tabular-nums ${
                  adjustStockPreview < 0 ? 'text-red-600' : 'text-gray-500'
                }`}
              >
                {bi('Result', '結果')}:{' '}
                <span className="font-medium text-gray-800">
                  {adjustStock.unit
                    ? formatRawQty(Math.max(0, adjustStockPreview), adjustStock.unit)
                    : Math.max(0, Math.floor(adjustStockPreview))}
                </span>
                {adjustStockPreview < 0 && (
                  <span className="ml-2">{bi('(invalid)', '（無效）')}</span>
                )}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border"
                disabled={busy}
                onClick={closeAdjustStock}
              >
                {BTN.cancel}
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  adjustStockPreview == null ||
                  adjustStockPreview < 0
                }
                onClick={submitAdjustStock}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-40"
              >
                {BTN.confirm}
              </button>
            </div>
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
                `All items for ${completeOrder.referenceNumber}${completeOrder.poNumber ? ` (PO# ${completeOrder.poNumber})` : ''} are marked. Confirm to deduct stock and mark this order done?`,
                `${completeOrder.referenceNumber}${completeOrder.poNumber ? `（PO# ${completeOrder.poNumber}）` : ''} 的所需項目已全部勾選。確認後將扣除庫存並將此訂單標為完成？`
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
                onClick={() => {
                  if (completeOrder) clearOrderTicks(completeOrder.id);
                  setCompleteOrder(null);
                }}
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
