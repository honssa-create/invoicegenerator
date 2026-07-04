/** Client-safe types, constants and formulas for Kitchen Prep (廚房備料系統). */

export const PREP_CAPACITIES = ['25g', '45g', '75g', '75g_big_belly'] as const;
export type PrepCapacity = (typeof PREP_CAPACITIES)[number];

export const PREP_CAPACITY_LABELS: Record<PrepCapacity, string> = {
  '25g': '25g',
  '45g': '45g',
  '75g': '75g (Normal)',
  '75g_big_belly': '75g (Big Belly)',
};

export const PREP_FLAVORS = ['osmanthus', 'red_date', 'rock_sugar'] as const;
export type PrepFlavor = (typeof PREP_FLAVORS)[number];

export const PREP_FLAVOR_LABELS: Record<PrepFlavor, string> = {
  osmanthus: '桂花 Osmanthus',
  red_date: '紅棗 Red Date',
  rock_sugar: '冰糖 Rock Sugar',
};

export const PREP_ORDER_TYPES = ['daily', 'wedding'] as const;
export type PrepOrderType = (typeof PREP_ORDER_TYPES)[number];

export const PREP_ORDER_TYPE_LABELS: Record<PrepOrderType, string> = {
  daily: '日常訂單 Daily',
  wedding: '回禮訂單 Wedding',
};

export const PREP_STATUSES = ['scheduled', 'in_prep', 'completed'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  scheduled: 'Scheduled 已排程',
  in_prep: 'In Prep 備料中',
  completed: 'Completed 已完成',
};

/** Per-bottle weights (grams) for one flavor line at a given capacity. */
export interface FlavorFormulaPerBottle {
  birdNest: number;
  /** Primary flavor ingredient (桂花 / 紅棗 / 冰糖 additive for this bottle type). */
  flavorIngredient: number;
  rockSugar: number;
  slabSugar: number;
}

/**
 * Configuration dictionary: capacity → flavor → per-bottle formula.
 * 25g uses flavor-specific recipes; 45g shares rock/slab sugar across flavors.
 */
export const CAPACITY_FLAVOR_FORMULAS: Partial<
  Record<PrepCapacity, Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>>>
> = {
  '25g': {
    osmanthus: {
      birdNest: 0.4,
      flavorIngredient: 0.072,
      rockSugar: 0,
      slabSugar: 2.79,
    },
    red_date: null, // disabled for 25g
    rock_sugar: {
      birdNest: 0.4,
      flavorIngredient: 1.98,
      rockSugar: 1.98,
      slabSugar: 0,
    },
  },
  '45g': {
    osmanthus: {
      birdNest: 0.8,
      flavorIngredient: 0.13,
      rockSugar: 0,
      slabSugar: 5.03,
    },
    red_date: {
      birdNest: 0.8,
      flavorIngredient: 1.8,
      rockSugar: 3.57,
      slabSugar: 0,
    },
    rock_sugar: {
      birdNest: 0.8,
      flavorIngredient: 3.57,
      rockSugar: 3.57,
      slabSugar: 0,
    },
  },
};

/** @deprecated Use CAPACITY_FLAVOR_FORMULAS — kept for reference / 45g flat view. */
export const FORMULA_45G = {
  birdNest: 0.8,
  osmanthus: 0.13,
  redDate: 1.8,
  rockSugar: 3.57,
  slabSugar: 5.03,
};

export const WEDDING_BUFFER = 3;

/** Quick-tap exception tags for the completion modal (tablet UI). */
export const COMPLETION_EXCEPTION_TAGS = [
  { id: 'broken_glass', label: 'Broken Glass 爆樽', text: '爆樽' },
  { id: 'ingredient_shortage', label: 'Ingredient Shortage 配料不足', text: '配料不足' },
  { id: 'quality_issue', label: 'Quality Issue 品質異常', text: '品質異常' },
] as const;

export const KITCHEN_COMPLETION_ACTIVITY_PREFIX = '[Kitchen Production Completed]';

export interface PrepCompletionSplit {
  label: string;
  qty: number;
}

export function buildKitchenCompletionActivityBody(
  orderCode: string,
  expected: number,
  actual: number,
  remarks: string | null,
  splits?: PrepCompletionSplit[] | null
): string {
  const variance = actual !== expected;
  const detail = variance
    ? `Expected: ${expected}, Actual: ${actual} ⚠️`
    : `Expected: ${expected}, Actual: ${actual}`;
  const splitPart =
    splits && splits.length > 0
      ? ` Split: ${splits.map((s) => `${s.label} ${s.qty}`).join(' + ')}.`
      : '';
  const remarkPart = remarks?.trim() ? ` Remarks: ${remarks.trim()}` : '';
  return `${KITCHEN_COMPLETION_ACTIVITY_PREFIX} ${orderCode} — ${detail}.${splitPart}${remarkPart}`;
}

export interface PrepFlavorQty {
  osmanthus: number;
  red_date: number;
  rock_sugar: number;
}

export interface PrepOrder {
  id: number;
  user_id: number;
  order_code: string;
  linked_order_id: number | null;
  stewing_date: string;
  order_type: PrepOrderType;
  capacity: PrepCapacity;
  status: PrepStatus;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  notes: string | null;
  expected_yield: number | null;
  actual_yield: number | null;
  completion_remarks: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_splits: PrepCompletionSplit[] | null;
  created_at: string;
  updated_at: string;
}

export interface FlavorCalcRow {
  flavor: PrepFlavor;
  label: string;
  orderQty: number;
  actualQty: number;
  weddingBuffer: number;
  birdNestGrams: number;
  flavorGrams: number;
  rockSugarGrams: number;
  slabSugarGrams: number;
  formula: FlavorFormulaPerBottle | null;
  disabled?: boolean;
}

export interface PrepCalculation {
  capacity: PrepCapacity;
  orderType: PrepOrderType;
  formulaReady: boolean;
  rows: FlavorCalcRow[];
  totals: {
    bottles: number;
    birdNestGrams: number;
    flavorGrams: number;
    rockSugarGrams: number;
    slabSugarGrams: number;
  };
}

export function isRedDateAllowed(capacity: PrepCapacity): boolean {
  return capacity !== '25g';
}

export function isCapacityFormulaReady(capacity: PrepCapacity): boolean {
  const block = CAPACITY_FLAVOR_FORMULAS[capacity];
  if (!block) return false;
  return PREP_FLAVORS.some((f) => {
    if (f === 'red_date' && !isRedDateAllowed(capacity)) return true;
    return block[f] != null;
  });
}

export function getFlavorFormula(
  capacity: PrepCapacity,
  flavor: PrepFlavor
): FlavorFormulaPerBottle | null {
  if (flavor === 'red_date' && !isRedDateAllowed(capacity)) return null;
  return CAPACITY_FLAVOR_FORMULAS[capacity]?.[flavor] ?? null;
}

export function actualProductionQty(orderQty: number, orderType: PrepOrderType): number {
  const base = Math.max(0, orderQty);
  return orderType === 'wedding' ? base + WEDDING_BUFFER : base;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcRow(
  flavor: PrepFlavor,
  orderQty: number,
  orderType: PrepOrderType,
  capacity: PrepCapacity
): FlavorCalcRow {
  const disabled = flavor === 'red_date' && !isRedDateAllowed(capacity);
  const safeOrderQty = disabled ? 0 : orderQty;
  const weddingBuffer = orderType === 'wedding' && safeOrderQty > 0 ? WEDDING_BUFFER : 0;
  const actualQty = actualProductionQty(safeOrderQty, orderType);
  const formula = getFlavorFormula(capacity, flavor);

  if (!formula || safeOrderQty <= 0) {
    return {
      flavor,
      label: PREP_FLAVOR_LABELS[flavor],
      orderQty: safeOrderQty,
      actualQty: disabled ? 0 : actualQty,
      weddingBuffer: disabled ? 0 : weddingBuffer,
      birdNestGrams: 0,
      flavorGrams: 0,
      rockSugarGrams: 0,
      slabSugarGrams: 0,
      formula,
      disabled,
    };
  }

  return {
    flavor,
    label: PREP_FLAVOR_LABELS[flavor],
    orderQty: safeOrderQty,
    actualQty,
    weddingBuffer,
    birdNestGrams: round2(actualQty * formula.birdNest),
    flavorGrams: round2(actualQty * formula.flavorIngredient),
    rockSugarGrams: round2(actualQty * formula.rockSugar),
    slabSugarGrams: round2(actualQty * formula.slabSugar),
    formula,
    disabled,
  };
}

export function computePrepCalculation(
  capacity: PrepCapacity,
  orderType: PrepOrderType,
  qtys: PrepFlavorQty
): PrepCalculation {
  const flavorMap: { flavor: PrepFlavor; qty: number }[] = [
    { flavor: 'osmanthus', qty: qtys.osmanthus },
    { flavor: 'red_date', qty: qtys.red_date },
    { flavor: 'rock_sugar', qty: qtys.rock_sugar },
  ];

  const rows = flavorMap.map(({ flavor, qty }) => calcRow(flavor, qty, orderType, capacity));

  if (rows.every((r) => r.orderQty === 0)) {
    for (const flavor of PREP_FLAVORS) {
      if (!rows.find((r) => r.flavor === flavor)) {
        rows.push(calcRow(flavor, 0, orderType, capacity));
      }
    }
  }

  const activeRows = rows.filter((r) => r.orderQty > 0 && !r.disabled);
  const totals = {
    bottles: activeRows.reduce((s, r) => s + r.actualQty, 0),
    birdNestGrams: round2(activeRows.reduce((s, r) => s + r.birdNestGrams, 0)),
    flavorGrams: round2(activeRows.reduce((s, r) => s + r.flavorGrams, 0)),
    rockSugarGrams: round2(activeRows.reduce((s, r) => s + r.rockSugarGrams, 0)),
    slabSugarGrams: round2(activeRows.reduce((s, r) => s + r.slabSugarGrams, 0)),
  };

  return {
    capacity,
    orderType,
    formulaReady: isCapacityFormulaReady(capacity),
    rows: rows.filter((r) => r.orderQty > 0 || !r.disabled),
    totals,
  };
}

export function formatGrams(n: number): string {
  if (n === 0) return '—';
  return `${n.toFixed(2)}g`;
}

export function formulaSummaryForCapacity(capacity: PrepCapacity): string {
  if (capacity === '25g') {
    return '25g: 桂花 → 燕餅 0.4g · 桂花 0.072g · 片糖 2.79g | 冰糖 → 燕餅 0.4g · 冰糖 1.98g';
  }
  if (capacity === '45g') {
    return '45g: 桂花 → 片糖 5.03g | 紅棗/冰糖 → 冰糖 3.57g (no 片糖 in 紅棗 & 冰糖; no 冰糖 in 桂花)';
  }
  return `${PREP_CAPACITY_LABELS[capacity]} formula pending configuration`;
}

/** Sum of flavor order quantities (excludes wedding buffer). */
export function originalOrderQuantity(qtys: PrepFlavorQty): number {
  return Math.max(0, qtys.osmanthus) + Math.max(0, qtys.red_date) + Math.max(0, qtys.rock_sugar);
}

/** Rule A: 紅棗 & 冰糖 — no 片糖. Rule B: 桂花 — no 冰糖. */
export function validateFormulaBusinessRules(
  flavor: PrepFlavor,
  formula: FlavorFormulaPerBottle
): string | null {
  if ((flavor === 'red_date' || flavor === 'rock_sugar') && formula.slabSugar > 0) {
    return `${PREP_FLAVOR_LABELS[flavor]} cannot include 片糖 Slab Sugar`;
  }
  if (flavor === 'osmanthus' && formula.rockSugar > 0) {
    return '桂花 Osmanthus cannot include 冰糖 Rock Sugar';
  }
  return null;
}

export function validatePrepFlavorQtys(
  capacity: PrepCapacity,
  qtys: PrepFlavorQty
): string | null {
  if (qtys.red_date > 0 && !isRedDateAllowed(capacity)) {
    return 'Red Date (紅棗) is not allowed for 25g capacity';
  }
  for (const flavor of PREP_FLAVORS) {
    const qty = qtys[flavor];
    if (qty <= 0) continue;
    const formula = getFlavorFormula(capacity, flavor);
    if (!formula) {
      return `No formula configured for ${PREP_FLAVOR_LABELS[flavor]} at ${PREP_CAPACITY_LABELS[capacity]}`;
    }
    const ruleErr = validateFormulaBusinessRules(flavor, formula);
    if (ruleErr) return ruleErr;
  }
  if (originalOrderQuantity(qtys) === 0) {
    return 'At least one flavor quantity is required';
  }
  return null;
}

/** Shared typography tokens for Kitchen Summary screen + print. */
export const PREP_SUMMARY_TYPO = {
  table: 'prep-summary-table w-full border-collapse text-[15px] leading-snug',
  thead: 'text-xs uppercase tracking-wider',
  th: 'px-4 py-3 font-semibold',
  flavorCell: 'text-lg font-bold',
  qtyCell: 'text-lg font-semibold tabular-nums',
  actualQtyCell: 'text-2xl font-bold tabular-nums',
  gramCell: 'text-lg font-bold tabular-nums',
  totalLabel: 'text-base font-bold',
  totalQty: 'text-xl font-bold tabular-nums',
  totalGram: 'text-lg font-bold tabular-nums',
  capacityBadge: 'text-sm font-semibold',
} as const;
