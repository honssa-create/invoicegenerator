/** Client-safe types, constants and formulas for Kitchen Prep (廚房備料系統). */

export const PREP_CAPACITIES = ['25g', '45g', '75g', '75g_big_belly'] as const;
/** Capacity id — defaults are PREP_CAPACITIES; org catalog may add more. */
export type PrepCapacity = string;

export const PREP_CAPACITY_LABELS: Record<string, string> = {
  '25g': '25g',
  '45g': '45g',
  '75g': '75g (高身樽)',
  '75g_big_belly': '75g (大肚樽)',
};

export const PREP_FLAVORS = ['osmanthus', 'red_date', 'rock_sugar'] as const;
export type PrepFlavor = (typeof PREP_FLAVORS)[number];

export const PREP_FLAVOR_LABELS: Record<PrepFlavor, string> = {
  osmanthus: '桂花 Osmanthus',
  red_date: '紅棗 Red Date',
  rock_sugar: '冰糖 Rock Sugar',
};

export const PREP_ORDER_TYPES = ['daily', 'wedding', 'restock'] as const;
export type PrepOrderType = (typeof PREP_ORDER_TYPES)[number];

export const PREP_ORDER_TYPE_LABELS: Record<PrepOrderType, string> = {
  daily: '日常訂單 Daily',
  wedding: '回禮訂單 Wedding',
  restock: '補充存貨 Restock',
};

export const PREP_STATUSES = ['inactive', 'scheduled', 'in_prep', 'completed'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  inactive: 'Inactive 未開始',
  scheduled: 'Scheduled 已排程',
  in_prep: 'In Prep 備料中',
  completed: 'Completed 已完成',
};

/** Calendar date in Asia/Hong_Kong as YYYY-MM-DD. */
export function hkTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Default status when creating a prep row.
 * Daily / 補充存貨 → in_prep. Wedding/回禮 → inactive until stewing/production date is due.
 */
export function defaultPrepStatusForCreate(
  orderType: PrepOrderType,
  stewingDate: string,
  opts?: { hasProductionDate?: boolean; today?: string }
): PrepStatus {
  if (orderType === 'daily' || orderType === 'restock') return 'in_prep';
  const today = opts?.today ?? hkTodayIso();
  if (opts?.hasProductionDate === false) return 'inactive';
  if (!stewingDate?.trim() || stewingDate > today) return 'inactive';
  return 'scheduled';
}

/** Wedding/回禮 status from stewing date (does not touch in_prep / completed). */
export function weddingPrepStatusFromDate(
  stewingDate: string,
  opts?: { hasProductionDate?: boolean; today?: string }
): PrepStatus {
  return defaultPrepStatusForCreate('wedding', stewingDate, opts);
}

/** One raw ingredient amount (per bottle) in a stew formula. */
export interface StewIngredientLine {
  name: string;
  qty: number;
}

/**
 * Per-bottle stew formula for one capacity × flavor.
 * Prefer `lines` (variable ingredient count). Legacy slot fields are still accepted on read.
 */
export interface FlavorFormulaPerBottle {
  lines?: StewIngredientLine[];
  /** @deprecated legacy fixed slots — migrated via getFormulaLines() */
  birdNest?: number;
  flavorIngredient?: number;
  rockSugar?: number;
  slabSugar?: number;
  birdNestIngredient?: string;
  flavorIngredientName?: string;
  rockSugarIngredient?: string;
  slabSugarIngredient?: string;
}

/** Default raw-material binding for legacy slots by bottle flavor. */
export function defaultStewSlotIngredients(flavor: PrepFlavor): {
  birdNestIngredient: string;
  flavorIngredientName: string;
  rockSugarIngredient: string;
  slabSugarIngredient: string;
} {
  return {
    birdNestIngredient: '燕餅',
    flavorIngredientName:
      flavor === 'osmanthus' ? '桂花' : flavor === 'red_date' ? '紅棗' : '冰糖',
    rockSugarIngredient: '冰糖',
    slabSugarIngredient: '片糖',
  };
}

/** Normalize any formula shape into a variable ingredient list (qty > 0 only). */
export function getFormulaLines(
  formula: FlavorFormulaPerBottle | null | undefined,
  flavor: PrepFlavor = 'osmanthus'
): StewIngredientLine[] {
  if (!formula) return [];
  if (Array.isArray(formula.lines)) {
    return formula.lines
      .map((l) => ({
        name: String(l?.name || '').trim(),
        qty: Math.max(0, Number(l?.qty) || 0),
      }))
      .filter((l) => l.name && l.qty > 0);
  }

  const d = defaultStewSlotIngredients(flavor);
  const pick = (v: string | undefined, fallback: string) => {
    const t = (v || '').trim();
    return t || fallback;
  };
  const birdNestIngredient = pick(formula.birdNestIngredient, d.birdNestIngredient);
  const flavorIngredientName = pick(formula.flavorIngredientName, d.flavorIngredientName);
  const rockSugarIngredient = pick(formula.rockSugarIngredient, d.rockSugarIngredient);
  const slabSugarIngredient = pick(formula.slabSugarIngredient, d.slabSugarIngredient);

  let flavorQty = Math.max(0, Number(formula.flavorIngredient) || 0);
  const rockQty = Math.max(0, Number(formula.rockSugar) || 0);
  // Legacy rock_sugar duplicated 冰糖 in flavorIngredient + rockSugar.
  if (
    flavor === 'rock_sugar' &&
    flavorQty > 0 &&
    rockQty > 0 &&
    flavorIngredientName === rockSugarIngredient
  ) {
    flavorQty = 0;
  }

  const acc: Record<string, number> = {};
  const add = (name: string, qty: number) => {
    if (!name || !(qty > 0)) return;
    acc[name] = (acc[name] || 0) + qty;
  };
  add(birdNestIngredient, Math.max(0, Number(formula.birdNest) || 0));
  add(flavorIngredientName, flavorQty);
  add(rockSugarIngredient, rockQty);
  add(slabSugarIngredient, Math.max(0, Number(formula.slabSugar) || 0));

  return Object.entries(acc).map(([name, qty]) => ({ name, qty }));
}

export function formulaFromLines(lines: StewIngredientLine[]): FlavorFormulaPerBottle {
  return {
    lines: lines
      .map((l) => ({
        name: String(l.name || '').trim(),
        qty: Math.max(0, Number(l.qty) || 0),
      }))
      .filter((l) => l.name),
  };
}

function line(name: string, qty: number): StewIngredientLine {
  return { name, qty };
}

/**
 * Configuration dictionary: capacity → flavor → per-bottle formula (variable ingredient lines).
 */
export const CAPACITY_FLAVOR_FORMULAS: Partial<
  Record<PrepCapacity, Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>>>
> = {
  '25g': {
    osmanthus: formulaFromLines([
      line('燕餅', 0.4),
      line('桂花', 0.072),
      line('片糖', 2.79),
    ]),
    red_date: null,
    rock_sugar: formulaFromLines([line('燕餅', 0.4), line('冰糖', 1.98)]),
  },
  '45g': {
    osmanthus: formulaFromLines([
      line('燕餅', 0.8),
      line('桂花', 0.13),
      line('片糖', 5.03),
    ]),
    red_date: formulaFromLines([
      line('燕餅', 0.8),
      line('紅棗', 1.8),
      line('冰糖', 3.57),
    ]),
    rock_sugar: formulaFromLines([line('燕餅', 0.8), line('冰糖', 3.57)]),
  },
  '75g': {
    osmanthus: formulaFromLines([
      line('燕餅', 1.7),
      line('桂花', 0.191),
      line('片糖', 7.64),
    ]),
    red_date: formulaFromLines([
      line('燕餅', 1.7),
      line('紅棗', 0.191),
      line('冰糖', 5.41),
    ]),
    rock_sugar: formulaFromLines([line('燕餅', 1.75), line('冰糖', 54.1)]),
  },
  '75g_big_belly': {
    osmanthus: formulaFromLines([
      line('燕餅', 2.1),
      line('桂花', 0.191),
      line('片糖', 7.64),
    ]),
    red_date: null,
    rock_sugar: formulaFromLines([line('燕餅', 2.1), line('冰糖', 54.1)]),
  },
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
  flavor?: PrepFlavor;
}

/** One split row per active flavor: label = 口味 + 容量, qty = 實際生產樽數. */
export function defaultCompletionSplits(
  calc: PrepCalculation,
  capacity: PrepCapacity
): PrepCompletionSplit[] {
  const capLabel = PREP_CAPACITY_LABELS[capacity];
  return calc.rows
    .filter((r) => r.orderQty > 0 && !r.disabled)
    .map((r) => ({
      label: `${r.label} ${capLabel}`,
      qty: r.actualQty,
      flavor: r.flavor,
    }));
}

export function completionSplitsTotal(splits: PrepCompletionSplit[]): number {
  return splits.reduce((sum, row) => sum + Math.max(0, row.qty), 0);
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
  /** Total grams per raw ingredient for this flavor row (actualQty × per-bottle). */
  ingredientGrams: Record<string, number>;
  /** @deprecated use ingredientGrams['燕餅'] */
  birdNestGrams: number;
  /** @deprecated use ingredientGrams for 桂花/紅棗 */
  flavorGrams: number;
  /** @deprecated use ingredientGrams['冰糖'] */
  rockSugarGrams: number;
  /** @deprecated use ingredientGrams['片糖'] */
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
    ingredientGrams: Record<string, number>;
    /** @deprecated */
    birdNestGrams: number;
    /** @deprecated */
    flavorGrams: number;
    /** @deprecated */
    rockSugarGrams: number;
    /** @deprecated */
    slabSugarGrams: number;
  };
}

export type StewFormulaMapLike = Partial<
  Record<string, Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>>>
>;

export function isRedDateAllowed(
  capacity: PrepCapacity,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): boolean {
  return getFlavorFormula(capacity, 'red_date', formulas) != null;
}

export function isCapacityFormulaReady(
  capacity: PrepCapacity,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): boolean {
  const block = formulas[capacity];
  if (!block) return false;
  return PREP_FLAVORS.some((f) => block[f] != null);
}

export function getFlavorFormula(
  capacity: PrepCapacity,
  flavor: PrepFlavor,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): FlavorFormulaPerBottle | null {
  const cell = formulas[capacity]?.[flavor];
  return cell === undefined ? null : cell;
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
  capacity: PrepCapacity,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): FlavorCalcRow {
  const formula = getFlavorFormula(capacity, flavor, formulas);
  const disabled = formula == null;
  const safeOrderQty = disabled ? 0 : orderQty;
  const weddingBuffer = orderType === 'wedding' && safeOrderQty > 0 ? WEDDING_BUFFER : 0;
  const actualQty = actualProductionQty(safeOrderQty, orderType);

  const emptyLegacy = {
    birdNestGrams: 0,
    flavorGrams: 0,
    rockSugarGrams: 0,
    slabSugarGrams: 0,
    ingredientGrams: {} as Record<string, number>,
  };

  if (!formula || safeOrderQty <= 0) {
    return {
      flavor,
      label: PREP_FLAVOR_LABELS[flavor],
      orderQty: safeOrderQty,
      actualQty: disabled ? 0 : actualQty,
      weddingBuffer: disabled ? 0 : weddingBuffer,
      ...emptyLegacy,
      formula,
      disabled,
    };
  }

  const ingredientGrams: Record<string, number> = {};
  for (const l of getFormulaLines(formula, flavor)) {
    ingredientGrams[l.name] = round2((ingredientGrams[l.name] || 0) + actualQty * l.qty);
  }

  return {
    flavor,
    label: PREP_FLAVOR_LABELS[flavor],
    orderQty: safeOrderQty,
    actualQty,
    weddingBuffer,
    ingredientGrams,
    birdNestGrams: ingredientGrams['燕餅'] || 0,
    flavorGrams:
      flavor === 'osmanthus'
        ? ingredientGrams['桂花'] || 0
        : flavor === 'red_date'
          ? ingredientGrams['紅棗'] || 0
          : 0,
    rockSugarGrams: ingredientGrams['冰糖'] || 0,
    slabSugarGrams: ingredientGrams['片糖'] || 0,
    formula,
    disabled,
  };
}

export function computePrepCalculation(
  capacity: PrepCapacity,
  orderType: PrepOrderType,
  qtys: PrepFlavorQty,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): PrepCalculation {
  const flavorMap: { flavor: PrepFlavor; qty: number }[] = [
    { flavor: 'osmanthus', qty: qtys.osmanthus },
    { flavor: 'red_date', qty: qtys.red_date },
    { flavor: 'rock_sugar', qty: qtys.rock_sugar },
  ];

  const rows = flavorMap.map(({ flavor, qty }) => calcRow(flavor, qty, orderType, capacity, formulas));

  if (rows.every((r) => r.orderQty === 0)) {
    for (const flavor of PREP_FLAVORS) {
      if (!rows.find((r) => r.flavor === flavor)) {
        rows.push(calcRow(flavor, 0, orderType, capacity, formulas));
      }
    }
  }

  const activeRows = rows.filter((r) => r.orderQty > 0 && !r.disabled);
  const ingredientGrams: Record<string, number> = {};
  for (const r of activeRows) {
    for (const [name, qty] of Object.entries(r.ingredientGrams)) {
      ingredientGrams[name] = round2((ingredientGrams[name] || 0) + qty);
    }
  }
  const totals = {
    bottles: activeRows.reduce((s, r) => s + r.actualQty, 0),
    ingredientGrams,
    birdNestGrams: ingredientGrams['燕餅'] || 0,
    flavorGrams: round2(
      (ingredientGrams['桂花'] || 0) + (ingredientGrams['紅棗'] || 0)
    ),
    rockSugarGrams: ingredientGrams['冰糖'] || 0,
    slabSugarGrams: ingredientGrams['片糖'] || 0,
  };

  return {
    capacity,
    orderType,
    formulaReady: isCapacityFormulaReady(capacity, formulas),
    rows: rows.filter((r) => r.orderQty > 0 || !r.disabled),
    totals,
  };
}

/**
 * Raw grams consumed for 完成燉製 from actual split bottle counts × per-bottle formula lines.
 */
export function computeStewingRawNeeds(
  capacity: PrepCapacity,
  splits: { flavor: PrepFlavor; qty: number }[],
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): { name: string; qty: number }[] {
  const acc: Record<string, number> = {};
  const add = (name: string, grams: number) => {
    const n = (name || '').trim();
    if (!n || !(grams > 0)) return;
    acc[n] = round2((acc[n] || 0) + grams);
  };

  for (const s of splits) {
    const qty = Math.max(0, Math.round(s.qty));
    if (!s.flavor || qty <= 0) continue;
    const formula = getFlavorFormula(capacity, s.flavor, formulas);
    if (!formula) continue;
    for (const l of getFormulaLines(formula, s.flavor)) {
      add(l.name, round2(qty * l.qty));
    }
  }

  return Object.keys(acc)
    .filter((name) => (acc[name] || 0) > 0)
    .map((name) => ({ name, qty: acc[name] }));
}

/** Raw grams needed for one prep order (uses actual production qty incl. wedding buffer). */
export function computePrepOrderRawNeeds(
  capacity: PrepCapacity,
  orderType: PrepOrderType,
  qtys: PrepFlavorQty,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): { name: string; qty: number }[] {
  const calc = computePrepCalculation(capacity, orderType, qtys, formulas);
  const splits = calc.rows
    .filter((r) => r.orderQty > 0 && !r.disabled)
    .map((r) => ({ flavor: r.flavor, qty: r.actualQty }));
  return computeStewingRawNeeds(capacity, splits, formulas);
}

/** Sum raw needs across unfinished prep orders (any status except completed). */
export function aggregateRawNeedsFromPrepOrders(
  orders: Array<{
    capacity: PrepCapacity;
    order_type: PrepOrderType;
    status: PrepStatus;
    qty_osmanthus: number;
    qty_red_date: number;
    qty_rock_sugar: number;
  }>,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const o of orders) {
    if (o.status === 'completed') continue;
    const lines = computePrepOrderRawNeeds(
      o.capacity,
      o.order_type,
      {
        osmanthus: o.qty_osmanthus,
        red_date: o.qty_red_date,
        rock_sugar: o.qty_rock_sugar,
      },
      formulas
    );
    for (const line of lines) {
      raw[line.name] = round2((raw[line.name] || 0) + line.qty);
    }
  }
  return raw;
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
  if (capacity === '75g') {
    return '75g 高身樽: 冰糖 → 燕餅 1.75g · 冰糖 54.1g | 桂花 → 燕餅 1.7g · 片糖 7.64g · 桂花 0.191g | 紅棗 → 燕餅 1.7g · 冰糖 5.41g · 紅棗 0.191g';
  }
  if (capacity === '75g_big_belly') {
    return '75g 大肚樽: 冰糖 → 燕餅 2.1g · 冰糖 54.1g | 桂花 → 燕餅 2.1g · 片糖 7.64g · 桂花 0.191g (紅棗 disabled)';
  }
  return `${PREP_CAPACITY_LABELS[capacity]} formula pending configuration`;
}

/** Sum of flavor order quantities (excludes wedding buffer). */
export function originalOrderQuantity(qtys: PrepFlavorQty): number {
  return Math.max(0, qtys.osmanthus) + Math.max(0, qtys.red_date) + Math.max(0, qtys.rock_sugar);
}

/** Deep-link to Kitchen Prep create form with capacity lines prefilled (e.g. gift-box shortfall). */
export function buildKitchenPrepCreateHref(input: {
  orderType?: PrepOrderType;
  lines: Array<{
    capacity: PrepCapacity;
    qty_osmanthus?: number;
    qty_red_date?: number;
    qty_rock_sugar?: number;
  }>;
}): string {
  const params = new URLSearchParams({ create: '1' });
  if (input.orderType) params.set('order_type', input.orderType);
  const lines = input.lines
    .filter((l) => Boolean(l.capacity))
    .map((l) => ({
      capacity: l.capacity,
      qty_osmanthus: Math.max(0, Math.round(Number(l.qty_osmanthus) || 0)),
      qty_red_date: Math.max(0, Math.round(Number(l.qty_red_date) || 0)),
      qty_rock_sugar: Math.max(0, Math.round(Number(l.qty_rock_sugar) || 0)),
    }))
    .filter((l) => l.qty_osmanthus + l.qty_red_date + l.qty_rock_sugar > 0);
  if (lines.length) params.set('lines', JSON.stringify(lines));
  return `/kitchen-prep?${params.toString()}`;
}

/** Rule A: 紅棗 & 冰糖 — no 片糖. Rule B: 桂花 — no 冰糖. */
export function validateFormulaBusinessRules(
  flavor: PrepFlavor,
  formula: FlavorFormulaPerBottle
): string | null {
  const lines = getFormulaLines(formula, flavor);
  const has = (name: string) => lines.some((l) => l.name === name && l.qty > 0);
  if ((flavor === 'red_date' || flavor === 'rock_sugar') && has('片糖')) {
    return `${PREP_FLAVOR_LABELS[flavor]} cannot include 片糖 Slab Sugar`;
  }
  if (flavor === 'osmanthus' && has('冰糖')) {
    return '桂花 Osmanthus cannot include 冰糖 Rock Sugar';
  }
  return null;
}

export function validatePrepFlavorQtys(
  capacity: PrepCapacity,
  qtys: PrepFlavorQty,
  opts?: { allowEmpty?: boolean; formulas?: StewFormulaMapLike }
): string | null {
  const formulas = opts?.formulas ?? CAPACITY_FLAVOR_FORMULAS;
  const capLabel = PREP_CAPACITY_LABELS[capacity] || capacity;
  if (qtys.red_date > 0 && !isRedDateAllowed(capacity, formulas)) {
    return `Red Date (紅棗) is not allowed for ${capLabel}`;
  }
  for (const flavor of PREP_FLAVORS) {
    const qty = qtys[flavor];
    if (qty <= 0) continue;
    const formula = getFlavorFormula(capacity, flavor, formulas);
    if (!formula) {
      return `No formula configured for ${PREP_FLAVOR_LABELS[flavor]} at ${capLabel}`;
    }
    const ruleErr = validateFormulaBusinessRules(flavor, formula);
    if (ruleErr) return ruleErr;
  }
  if (!opts?.allowEmpty && originalOrderQuantity(qtys) === 0) {
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
