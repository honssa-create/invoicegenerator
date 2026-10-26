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

/** Short flavor names used on schedule-style lines (`桂花 x40`). */
export const PREP_FLAVOR_SHORT: Record<PrepFlavor, string> = {
  osmanthus: '桂花',
  red_date: '紅棗',
  rock_sugar: '冰糖',
};

/**
 * Stew pot limits in bottles. Each capacity is its own bucket:
 * smaller jars (25g / 45g) use 150, 75g jars use 100.
 * A 75g + 45g mix has a separate combined cap of 120.
 * 25g is never added into the 45g 150, and 45g is never added into the 75g 100.
 */
export const STEW_POT_LIMIT_SMALL = 150;
export const STEW_POT_LIMIT_LARGE = 100;
export const STEW_POT_LIMIT_MIXED_75_45 = 120;

/** Per-flavor bird's-nest cake type for stewing (maps to raw stock name). */
export const BIRD_NEST_TYPES = ['large', 'small'] as const;
export type BirdNestType = (typeof BIRD_NEST_TYPES)[number];

export const BIRD_NEST_TYPE_LABELS: Record<BirdNestType, string> = {
  large: '大燕餅',
  small: '細燕餅',
};

/** Formula line names that represent bird-nest grams (resolved at calc time). */
export const BIRD_NEST_FORMULA_NAMES = ['燕餅', '大燕餅', '細燕餅'] as const;

/** Placeholder in stew formulas — resolved per prep order to 大燕餅 or 細燕餅. */
export const BIRD_NEST_FORMULA_PLACEHOLDER = '燕餅';

export function isBirdNestFormulaIngredient(name: string): boolean {
  return (BIRD_NEST_FORMULA_NAMES as readonly string[]).includes(name);
}

/** Stew formula ingredient allowed without a row in the raw-materials catalog. */
export function isStewFormulaCatalogExempt(name: string): boolean {
  const n = String(name || '').trim();
  if (n === BIRD_NEST_FORMULA_PLACEHOLDER) return true;
  if (isUntrackedStewIngredient(n)) return true;
  return false;
}

export function birdNestMaterialName(type: BirdNestType): string {
  return BIRD_NEST_TYPE_LABELS[type];
}

export function parseBirdNestType(raw: string | null | undefined): BirdNestType {
  return raw === 'small' ? 'small' : 'large';
}

export function resolveFormulaIngredientName(
  name: string,
  birdNestType: BirdNestType,
  capacity: PrepCapacity
): string {
  if (isBirdNestFormulaIngredient(name)) return birdNestMaterialName(birdNestType);
  if (isGlassBottleFormulaIngredient(name)) return stewGlassBottleName(capacity);
  return name;
}

/** Stew glass jar stock name per prep capacity. */
export const STEW_GLASS_BOTTLE_STOCK_NAMES: Record<string, string> = {
  '25g': '25g玻璃燉瓶',
  '45g': '45g玻璃燉瓶',
  '75g': '75g玻璃燉瓶(高身)',
  '75g_big_belly': '75g玻璃燉瓶(大肚)',
};

export const LEGACY_GLASS_BOTTLE_NAME = '玻璃燉瓶';

/** Default jar size for 隨心燉 gift-box BOM (legacy 「玻璃燉瓶」 slot). */
export const DEFAULT_GIFT_BOX_GLASS_BOTTLE_CAPACITY: PrepCapacity = '75g_big_belly';

export function defaultGiftBoxGlassBottleStockName(): string {
  return stewGlassBottleName(DEFAULT_GIFT_BOX_GLASS_BOTTLE_CAPACITY);
}

export function stewGlassBottleName(capacity: PrepCapacity): string {
  return STEW_GLASS_BOTTLE_STOCK_NAMES[capacity] ?? `${capacity}玻璃燉瓶`;
}

export function isGlassBottleFormulaIngredient(name: string): boolean {
  if (name === LEGACY_GLASS_BOTTLE_NAME) return true;
  return Object.values(STEW_GLASS_BOTTLE_STOCK_NAMES).includes(name);
}

export function resolveRawStockName(name: string, birdNestType: BirdNestType = 'large'): string {
  if (name === LEGACY_GLASS_BOTTLE_NAME) return defaultGiftBoxGlassBottleStockName();
  if (name === BIRD_NEST_FORMULA_PLACEHOLDER) return birdNestMaterialName(birdNestType);
  return name;
}

export function bomRawDisplayLabel(name: string, birdNestType?: BirdNestType): string {
  if (name === LEGACY_GLASS_BOTTLE_NAME) return defaultGiftBoxGlassBottleStockName();
  if (name === BIRD_NEST_FORMULA_PLACEHOLDER && birdNestType) {
    return birdNestMaterialName(birdNestType);
  }
  return name;
}

export function isStewGlassBottleStockName(name: string): boolean {
  return name.includes('玻璃燉瓶');
}

export interface PrepBirdNestSelections {
  osmanthus: BirdNestType;
  red_date: BirdNestType;
  rock_sugar: BirdNestType;
}

export function prepOrderBirdNestSelections(order: {
  bird_nest_osmanthus?: string | null;
  bird_nest_red_date?: string | null;
  bird_nest_rock_sugar?: string | null;
}): PrepBirdNestSelections {
  return {
    osmanthus: parseBirdNestType(order.bird_nest_osmanthus),
    red_date: parseBirdNestType(order.bird_nest_red_date),
    rock_sugar: parseBirdNestType(order.bird_nest_rock_sugar),
  };
}

export function totalBirdNestGrams(ingredientGrams: Record<string, number>): number {
  return round2(
    (ingredientGrams[BIRD_NEST_TYPE_LABELS.large] || 0) +
      (ingredientGrams[BIRD_NEST_TYPE_LABELS.small] || 0)
  );
}

export const PREP_ORDER_TYPES = ['daily', 'wedding', 'restock'] as const;
export type PrepOrderType = (typeof PREP_ORDER_TYPES)[number];

export const PREP_ORDER_TYPE_LABELS: Record<PrepOrderType, string> = {
  daily: '日常訂單 Daily',
  wedding: '回禮訂單 Wedding',
  restock: '補充存貨 Restock',
};

/** Morning / afternoon stewing session. Null in the database means unset. */
export const PREP_SCHEDULE_SLOTS = ['AM', 'PM'] as const;
export type PrepScheduleSlot = (typeof PREP_SCHEDULE_SLOTS)[number];

export const PREP_SCHEDULE_SLOT_LABELS: Record<PrepScheduleSlot, string> = {
  AM: '上午 AM',
  PM: '下午 PM',
};

/** Accepts AM/PM in any case. Anything else, including blank, is unset. */
export function parsePrepScheduleSlot(raw: unknown): PrepScheduleSlot | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase();
  if (v === 'AM' || v === 'PM') return v;
  return null;
}

/**
 * Board order inside one stewing date: AM, then PM, then unset.
 * Date descending does not reverse this.
 */
export function prepScheduleSlotRank(slot: PrepScheduleSlot | null | undefined): number {
  if (slot === 'AM') return 0;
  if (slot === 'PM') return 1;
  return 2;
}

/** `${date}|AM`, `${date}|PM`, or `${date}|unset`. */
export function prepSessionGroupKey(
  stewingDate: string,
  slot: PrepScheduleSlot | null | undefined,
): string {
  const date = stewingDate || '';
  if (slot === 'AM' || slot === 'PM') return `${date}|${slot}`;
  return `${date}|unset`;
}

/** Visible group title. Unset is its own bucket and is not labeled AM or PM. */
export function prepSessionTitle(
  stewingDate: string,
  slot: PrepScheduleSlot | null | undefined,
): string {
  const date = stewingDate || '—';
  if (slot === 'AM') return `${date} 上午 AM session`;
  if (slot === 'PM') return `${date} 下午 PM session`;
  return `${date} 未設定 Unset`;
}

const PREP_WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

/** Weekday for a calendar YYYY-MM-DD. Uses the date itself, not the viewer timezone. */
export function prepWeekdayLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return PREP_WEEKDAY_LABELS[weekday] || '';
}

function prepDateWithWeekday(stewingDate: string): string {
  const date = stewingDate || '—';
  const weekday = prepWeekdayLabel(stewingDate);
  return weekday ? `${date} ${weekday}` : date;
}

/** Day card heading: `2026-10-27 星期二 · 全日`. */
export function prepDayCardTitle(stewingDate: string): string {
  return `${prepDateWithWeekday(stewingDate)} · 全日`;
}

/** Session card heading beside the AM / PM badge. */
export function prepSessionCardTitle(
  stewingDate: string,
  slot: PrepScheduleSlot | null | undefined,
): string {
  const head = prepDateWithWeekday(stewingDate);
  if (slot === 'AM') return `${head} · 上午批次`;
  if (slot === 'PM') return `${head} · 下午批次`;
  return `${head} · 未設定`;
}

/** One print job for every prep sheet in a session group. Ids stay in board order. */
export function prepGroupPrintPath(ids: number[]): string {
  const clean = ids.filter((id) => Number.isInteger(id) && id > 0);
  return `/kitchen-prep/print?ids=${clean.join(',')}`;
}

/** One combined materials sheet for every order on a stewing date (AM + PM + unset). */
export function prepDayMaterialsPrintPath(stewingDate: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(stewingDate) ? stewingDate : '';
  return `/kitchen-prep/day-print?date=${encodeURIComponent(date)}`;
}

/**
 * Session-group workflow. One button at a time:
 * start until every open order is stewing, then complete, then nothing.
 * Completed orders do not keep the group on the start button.
 */
export type PrepSessionWorkflow = 'start' | 'complete' | 'done';

export function prepSessionWorkflow(statuses: Array<PrepStatus | string>): PrepSessionWorkflow {
  const open = statuses.filter((status) => status !== 'completed');
  if (open.length === 0) return 'done';
  if (open.every((status) => status === 'stewing')) return 'complete';
  return 'start';
}

export const PREP_STATUSES = ['not_started', 'scheduled', 'prepped', 'stewing', 'completed'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  not_started: '未開始',
  scheduled: '已排程',
  prepped: '已備料',
  stewing: '炖製中',
  completed: '已完成',
};

/** Status values allowed in bulk edit (completion still uses the yield modal). */
export const PREP_STATUSES_BULK_EDIT: PrepStatus[] = PREP_STATUSES.filter(
  (s) => s !== 'completed',
);

export type PrepStatusAction =
  | { type: 'advance'; nextStatus: PrepStatus; label: string }
  | { type: 'complete'; label: string };

/** Stewing start timestamp when advancing prep workflow status (shared by API bulk + single). */
export function nextStewingStartedAt(
  existing: { status: PrepStatus; stewing_started_at: string | null },
  nextStatus: PrepStatus,
): string | null {
  if (nextStatus === 'stewing' && existing.status !== 'stewing') {
    return hkNowDateTime();
  }
  if (nextStatus !== 'stewing' && nextStatus !== 'completed') {
    return null;
  }
  return existing.stewing_started_at;
}

/** Primary workflow button for scheduled → prepped → stewing → completed. */
export function getPrepStatusAction(status: PrepStatus): PrepStatusAction | null {
  switch (status) {
    case 'not_started':
      return { type: 'advance', nextStatus: 'prepped', label: '完成備料' };
    case 'scheduled':
      return { type: 'advance', nextStatus: 'prepped', label: '完成備料' };
    case 'prepped':
      return { type: 'advance', nextStatus: 'stewing', label: '開始炖製' };
    case 'stewing':
      return { type: 'complete', label: '完成炖製' };
    default:
      return null;
  }
}

/** Calendar date in Asia/Hong_Kong as YYYY-MM-DD. */
export function hkTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Local date-time in Asia/Hong_Kong as YYYY-MM-DD HH:mm:ss. */
export function hkNowDateTime(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Default status when creating a prep row.
 * Daily / 補充存貨 → scheduled. Wedding/回禮 → not_started until stewing/production date is due.
 */
export function defaultPrepStatusForCreate(
  orderType: PrepOrderType,
  stewingDate: string,
  opts?: { hasProductionDate?: boolean; today?: string }
): PrepStatus {
  if (orderType === 'daily' || orderType === 'restock') return 'scheduled';
  const today = opts?.today ?? hkTodayIso();
  if (opts?.hasProductionDate === false) return 'not_started';
  if (!stewingDate?.trim() || stewingDate > today) return 'not_started';
  return 'scheduled';
}

/** Wedding/回禮 status from stewing date (does not touch prepped / stewing / completed). */
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

/** Normalize any formula shape into a variable ingredient list. */
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
      .filter((l) => l.name);
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

/** Stew water ingredients (grams per bottle). */
export const STEW_WATER_BOIL_SUGAR = '水(煮糖)';
export const STEW_WATER_COLD_SOAK = '水(冷泡)';

const UNTRACKED_STEW_INGREDIENTS = new Set([STEW_WATER_BOIL_SUGAR, STEW_WATER_COLD_SOAK]);

/** Prep formula lines that are not tracked in kitchen raw inventory. */
export function isUntrackedStewIngredient(name: string): boolean {
  return UNTRACKED_STEW_INGREDIENTS.has(String(name || '').trim());
}

/** Append standard water lines when missing (used by defaults and catalog merge). */
export function withStewWaterLines(
  lines: StewIngredientLine[],
  flavor: PrepFlavor
): StewIngredientLine[] {
  const names = new Set(lines.map((l) => l.name));
  const out = [...lines];
  if (!names.has(STEW_WATER_BOIL_SUGAR)) {
    out.push(line(STEW_WATER_BOIL_SUGAR, 0));
  }
  if (flavor === 'osmanthus' && !names.has(STEW_WATER_COLD_SOAK)) {
    out.push(line(STEW_WATER_COLD_SOAK, 0));
  }
  return out;
}

function stewFormula(flavor: PrepFlavor, ...ingredients: StewIngredientLine[]): FlavorFormulaPerBottle {
  return formulaFromLines(withStewWaterLines(ingredients, flavor));
}

/**
 * Configuration dictionary: capacity → flavor → per-bottle formula (variable ingredient lines).
 */
export const CAPACITY_FLAVOR_FORMULAS: Partial<
  Record<PrepCapacity, Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>>>
> = {
  '25g': {
    osmanthus: stewFormula(
      'osmanthus',
      line('燕餅', 0.4),
      line('桂花', 0.072),
      line('片糖', 2.79)
    ),
    red_date: null,
    rock_sugar: stewFormula('rock_sugar', line('燕餅', 0.4), line('冰糖', 1.98)),
  },
  '45g': {
    osmanthus: stewFormula(
      'osmanthus',
      line('燕餅', 0.8),
      line('桂花', 0.13),
      line('片糖', 5.03)
    ),
    red_date: stewFormula(
      'red_date',
      line('燕餅', 0.8),
      line('紅棗', 1.8),
      line('冰糖', 3.57)
    ),
    rock_sugar: stewFormula('rock_sugar', line('燕餅', 0.8), line('冰糖', 3.57)),
  },
  '75g': {
    osmanthus: stewFormula(
      'osmanthus',
      line('燕餅', 1.7),
      line('桂花', 0.191),
      line('片糖', 7.64)
    ),
    red_date: stewFormula(
      'red_date',
      line('燕餅', 1.7),
      line('紅棗', 0.191),
      line('冰糖', 5.41)
    ),
    rock_sugar: stewFormula('rock_sugar', line('燕餅', 1.75), line('冰糖', 54.1)),
  },
  '75g_big_belly': {
    osmanthus: stewFormula(
      'osmanthus',
      line('燕餅', 2.1),
      line('桂花', 0.191),
      line('片糖', 7.64)
    ),
    red_date: null,
    rock_sugar: stewFormula('rock_sugar', line('燕餅', 2.1), line('冰糖', 54.1)),
  },
};

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
  /** Capacity for this split. Stock and raw formulas use this, not a single order capacity. */
  capacity?: PrepCapacity;
}

/** One split row per active flavor × capacity. Label = 口味 + 容量, qty = 實際生產樽數. */
export function defaultCompletionSplits(
  calc: PrepCalculation,
  capacity: PrepCapacity
): PrepCompletionSplit[] {
  return calc.rows
    .filter((r) => (r.orderQty > 0 || r.actualQty > 0) && !r.disabled)
    .map((r) => {
      const rowCapacity = r.capacity || capacity;
      return {
        label: `${r.label} ${capacityScheduleTag(rowCapacity)}`,
        qty: r.actualQty,
        flavor: r.flavor,
        capacity: rowCapacity,
      };
    });
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

/** One capacity inside a prep order. Several lines share one order_code. */
export interface PrepCapacityLine {
  capacity: PrepCapacity;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus?: number | null;
  actual_qty_red_date?: number | null;
  actual_qty_rock_sugar?: number | null;
  bird_nest_osmanthus?: BirdNestType;
  bird_nest_red_date?: BirdNestType;
  bird_nest_rock_sugar?: BirdNestType;
}

export interface PrepOrder {
  id: number;
  user_id: number;
  order_code: string;
  linked_order_id: number | null;
  stewing_date: string;
  /** AM/PM stewing session. Null when the row was never assigned a session. */
  schedule_slot: PrepScheduleSlot | null;
  order_type: PrepOrderType;
  /** First capacity. Legacy single-capacity rows use this column as the only line. */
  capacity: PrepCapacity;
  status: PrepStatus;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus: number | null;
  actual_qty_red_date: number | null;
  actual_qty_rock_sugar: number | null;
  bird_nest_osmanthus: BirdNestType;
  bird_nest_red_date: BirdNestType;
  bird_nest_rock_sugar: BirdNestType;
  /**
   * Capacity lines for this order. Hydration always fills at least one entry.
   * Single-capacity orders mirror the parent columns; multi-capacity orders
   * store the full set and keep the parent columns equal to the first line.
   */
  lines?: PrepCapacityLine[] | null;
  notes: string | null;
  expected_yield: number | null;
  actual_yield: number | null;
  completion_remarks: string | null;
  completed_at: string | null;
  completed_by: string | null;
  stewing_started_at: string | null;
  completion_splits: PrepCompletionSplit[] | null;
  created_at: string;
  updated_at: string;
}

export interface FlavorCalcRow {
  flavor: PrepFlavor;
  capacity?: PrepCapacity;
  label: string;
  orderQty: number;
  actualQty: number;
  extraQty: number;
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
  birdNestType?: BirdNestType;
}

export interface PrepCalculation {
  capacity: PrepCapacity;
  /** Set when the order spans more than one capacity line. */
  capacities?: PrepCapacity[];
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

/** Stored actual qty, or order qty when actual has not been set. */
export function resolveActualQty(orderQty: number, actualQty?: number | null): number {
  const base = Math.max(0, Math.round(Number(orderQty) || 0));
  if (actualQty == null || actualQty === ('' as unknown as number)) return base;
  const n = Number(actualQty);
  if (!Number.isFinite(n)) return base;
  return Math.max(0, Math.round(n));
}

export function prepOrderQtys(order: {
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
}): PrepFlavorQty {
  return {
    osmanthus: Math.max(0, order.qty_osmanthus || 0),
    red_date: Math.max(0, order.qty_red_date || 0),
    rock_sugar: Math.max(0, order.qty_rock_sugar || 0),
  };
}

/** Keep a custom actual qty when order qty changes; otherwise follow the new order qty. */
export function nextActualQty(
  prevOrder: number,
  prevActual: number | null | undefined,
  nextOrder: number,
  nextActual?: number | null
): number {
  if (nextActual !== undefined && nextActual !== null) {
    return Math.max(0, Math.round(Number(nextActual) || 0));
  }
  if (prevActual == null || prevActual === prevOrder) return Math.max(0, nextOrder);
  return Math.max(0, prevActual);
}

export function prepOrderActualQtys(order: {
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus?: number | null;
  actual_qty_red_date?: number | null;
  actual_qty_rock_sugar?: number | null;
}): PrepFlavorQty {
  return {
    osmanthus: resolveActualQty(order.qty_osmanthus, order.actual_qty_osmanthus),
    red_date: resolveActualQty(order.qty_red_date, order.actual_qty_red_date),
    rock_sugar: resolveActualQty(order.qty_rock_sugar, order.actual_qty_rock_sugar),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcRow(
  flavor: PrepFlavor,
  orderQty: number,
  actualOverride: number | null | undefined,
  capacity: PrepCapacity,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS,
  birdNestType: BirdNestType = 'large'
): FlavorCalcRow {
  const formula = getFlavorFormula(capacity, flavor, formulas);
  const disabled = formula == null;
  const safeOrderQty = disabled ? 0 : Math.max(0, Math.round(Number(orderQty) || 0));
  const actualQty = disabled ? 0 : resolveActualQty(safeOrderQty, actualOverride);
  const extraQty = Math.max(0, actualQty - safeOrderQty);

  const emptyLegacy = {
    birdNestGrams: 0,
    flavorGrams: 0,
    rockSugarGrams: 0,
    slabSugarGrams: 0,
    ingredientGrams: {} as Record<string, number>,
  };

  if (!formula || (safeOrderQty <= 0 && actualQty <= 0)) {
    return {
      flavor,
      capacity,
      label: PREP_FLAVOR_LABELS[flavor],
      orderQty: safeOrderQty,
      actualQty,
      extraQty: disabled ? 0 : extraQty,
      ...emptyLegacy,
      formula,
      disabled,
    };
  }

  const ingredientGrams: Record<string, number> = {};
  for (const l of getFormulaLines(formula, flavor)) {
    if (isGlassBottleFormulaIngredient(l.name)) continue;
    const resolved = resolveFormulaIngredientName(l.name, birdNestType, capacity);
    ingredientGrams[resolved] = round2((ingredientGrams[resolved] || 0) + actualQty * l.qty);
  }
  if (actualQty > 0) {
    const glassName = stewGlassBottleName(capacity);
    ingredientGrams[glassName] = (ingredientGrams[glassName] || 0) + actualQty;
  }

  return {
    flavor,
    capacity,
    label: PREP_FLAVOR_LABELS[flavor],
    orderQty: safeOrderQty,
    actualQty,
    extraQty,
    ingredientGrams,
    birdNestGrams: totalBirdNestGrams(ingredientGrams),
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
    birdNestType,
  };
}

export function computePrepCalculation(
  capacity: PrepCapacity,
  orderType: PrepOrderType,
  qtys: PrepFlavorQty,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS,
  actualQtys?: Partial<Record<keyof PrepFlavorQty, number | null>> | null,
  birdNestSelections?: Partial<PrepBirdNestSelections> | null
): PrepCalculation {
  const flavorMap: { flavor: PrepFlavor; qty: number; actual?: number | null }[] = [
    { flavor: 'osmanthus', qty: qtys.osmanthus, actual: actualQtys?.osmanthus },
    { flavor: 'red_date', qty: qtys.red_date, actual: actualQtys?.red_date },
    { flavor: 'rock_sugar', qty: qtys.rock_sugar, actual: actualQtys?.rock_sugar },
  ];

  const rows = flavorMap.map(({ flavor, qty, actual }) =>
    calcRow(
      flavor,
      qty,
      actual,
      capacity,
      formulas,
      birdNestSelections?.[flavor] ?? 'large'
    )
  );

  if (rows.every((r) => r.orderQty === 0 && r.actualQty === 0)) {
    for (const flavor of PREP_FLAVORS) {
      if (!rows.find((r) => r.flavor === flavor)) {
        rows.push(calcRow(flavor, 0, null, capacity, formulas));
      }
    }
  }

  const activeRows = rows.filter((r) => (r.orderQty > 0 || r.actualQty > 0) && !r.disabled);
  const ingredientGrams: Record<string, number> = {};
  for (const r of activeRows) {
    for (const [name, qty] of Object.entries(r.ingredientGrams)) {
      ingredientGrams[name] = round2((ingredientGrams[name] || 0) + qty);
    }
  }
  const totals = {
    bottles: activeRows.reduce((s, r) => s + r.actualQty, 0),
    ingredientGrams,
    birdNestGrams: totalBirdNestGrams(ingredientGrams),
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
    rows: rows.filter((r) => r.orderQty > 0 || r.actualQty > 0 || !r.disabled),
    totals,
  };
}

/**
 * Raw grams consumed for 完成燉製 from actual split bottle counts × per-bottle formula lines.
 */
export function computeStewingRawNeeds(
  capacity: PrepCapacity,
  splits: { flavor: PrepFlavor; qty: number }[],
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS,
  birdNestSelections?: Partial<PrepBirdNestSelections> | null
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
    const birdNestType = birdNestSelections?.[s.flavor] ?? 'large';
    for (const l of getFormulaLines(formula, s.flavor)) {
      if (isGlassBottleFormulaIngredient(l.name)) continue;
      const resolved = resolveFormulaIngredientName(l.name, birdNestType, capacity);
      if (isUntrackedStewIngredient(resolved)) continue;
      add(resolved, round2(qty * l.qty));
    }
    add(stewGlassBottleName(capacity), qty);
  }

  return Object.keys(acc)
    .filter((name) => (acc[name] || 0) > 0)
    .map((name) => ({ name, qty: acc[name] }));
}

export function computePrepCalculationForOrder(
  order: {
    capacity: PrepCapacity;
    order_type: PrepOrderType;
    qty_osmanthus: number;
    qty_red_date: number;
    qty_rock_sugar: number;
    actual_qty_osmanthus?: number | null;
    actual_qty_red_date?: number | null;
    actual_qty_rock_sugar?: number | null;
    bird_nest_osmanthus?: string | null;
    bird_nest_red_date?: string | null;
    bird_nest_rock_sugar?: string | null;
    lines?: PrepCapacityLine[] | null;
    lines_json?: string | null;
  },
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): PrepCalculation {
  const lines = prepOrderLines(order);
  const parts = lines.map((line) =>
    computePrepCalculation(
      line.capacity,
      order.order_type,
      prepOrderQtys(line),
      formulas,
      {
        osmanthus: line.actual_qty_osmanthus,
        red_date: line.actual_qty_red_date,
        rock_sugar: line.actual_qty_rock_sugar,
      },
      birdNestForPrepLine(order, line)
    )
  );
  if (parts.length <= 1) {
    return parts[0] ?? computePrepCalculation(order.capacity, order.order_type, prepOrderQtys(order), formulas);
  }
  return mergePrepCalculations(order.order_type, parts);
}

/** Raw grams needed for one prep order (uses stored actual production qty). */
export function computePrepOrderRawNeeds(
  capacity: PrepCapacity,
  orderType: PrepOrderType,
  qtys: PrepFlavorQty,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS,
  actualQtys?: Partial<Record<keyof PrepFlavorQty, number | null>> | null,
  birdNestSelections?: Partial<PrepBirdNestSelections> | null
): { name: string; qty: number }[] {
  const calc = computePrepCalculation(
    capacity,
    orderType,
    qtys,
    formulas,
    actualQtys,
    birdNestSelections
  );
  const splits = calc.rows
    .filter((r) => (r.orderQty > 0 || r.actualQty > 0) && !r.disabled)
    .map((r) => ({ flavor: r.flavor, qty: r.actualQty }));
  return computeStewingRawNeeds(capacity, splits, formulas, birdNestSelections);
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
    actual_qty_osmanthus?: number | null;
    actual_qty_red_date?: number | null;
    actual_qty_rock_sugar?: number | null;
    bird_nest_osmanthus?: string | null;
    bird_nest_red_date?: string | null;
    bird_nest_rock_sugar?: string | null;
    lines?: PrepCapacityLine[] | null;
    lines_json?: string | null;
  }>,
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const o of orders) {
    if (o.status === 'completed') continue;
    for (const line of prepOrderLines(o)) {
      const birdNest = birdNestForPrepLine(o, line);
      const needs = computePrepOrderRawNeeds(
        line.capacity,
        o.order_type,
        prepOrderQtys(line),
        formulas,
        {
          osmanthus: line.actual_qty_osmanthus,
          red_date: line.actual_qty_red_date,
          rock_sugar: line.actual_qty_rock_sugar,
        },
        birdNest
      );
      for (const need of needs) {
        raw[need.name] = round2((raw[need.name] || 0) + need.qty);
      }
    }
  }
  return raw;
}

export function formatGrams(n: number): string {
  if (n === 0) return '—';
  return `${n.toFixed(2)}g`;
}

export function formatPrepIngredientQty(name: string, qty: number): string {
  if (qty === 0) return '—';
  if (isStewGlassBottleStockName(name)) return String(Math.round(qty));
  return formatGrams(qty);
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

/** Sum of flavor order quantities (客人訂). */
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

export type PrepCapacityLineDraft = {
  capacity?: string;
  qty_osmanthus?: number;
  qty_red_date?: number;
  qty_rock_sugar?: number;
  actual_qty_osmanthus?: number | null;
  actual_qty_red_date?: number | null;
  actual_qty_rock_sugar?: number | null;
  bird_nest_osmanthus?: string | null;
  bird_nest_red_date?: string | null;
  bird_nest_rock_sugar?: string | null;
};

function nonNegInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function optionalNonNegInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  return nonNegInt(value);
}

function optionalBirdNest(value: unknown): BirdNestType | undefined {
  if (value === 'small' || value === 'large') return value;
  return undefined;
}

export function normalizePrepCapacityLine(raw: PrepCapacityLineDraft): PrepCapacityLine | null {
  const capacity = String(raw.capacity || '').trim();
  if (!capacity) return null;
  return {
    capacity,
    qty_osmanthus: nonNegInt(raw.qty_osmanthus),
    qty_red_date: nonNegInt(raw.qty_red_date),
    qty_rock_sugar: nonNegInt(raw.qty_rock_sugar),
    actual_qty_osmanthus: optionalNonNegInt(raw.actual_qty_osmanthus),
    actual_qty_red_date: optionalNonNegInt(raw.actual_qty_red_date),
    actual_qty_rock_sugar: optionalNonNegInt(raw.actual_qty_rock_sugar),
    bird_nest_osmanthus: optionalBirdNest(raw.bird_nest_osmanthus),
    bird_nest_red_date: optionalBirdNest(raw.bird_nest_red_date),
    bird_nest_rock_sugar: optionalBirdNest(raw.bird_nest_rock_sugar),
  };
}

export function parsePrepLinesJson(raw: string | null | undefined): PrepCapacityLine[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const lines = parsed
      .map((row) => normalizePrepCapacityLine((row || {}) as PrepCapacityLineDraft))
      .filter((line): line is PrepCapacityLine => line != null);
    return lines.length ? mergePrepCapacityLines(lines) : null;
  } catch {
    return null;
  }
}

/** Sum duplicate capacities into one line. Order of first appearance is kept. */
export function mergePrepCapacityLines(lines: PrepCapacityLine[]): PrepCapacityLine[] {
  const order: string[] = [];
  const map = new Map<string, PrepCapacityLine>();
  for (const line of lines) {
    const prev = map.get(line.capacity);
    if (!prev) {
      order.push(line.capacity);
      map.set(line.capacity, { ...line });
      continue;
    }
    const actualOsmanthus =
      resolveActualQty(prev.qty_osmanthus, prev.actual_qty_osmanthus) +
      resolveActualQty(line.qty_osmanthus, line.actual_qty_osmanthus);
    const actualRed =
      resolveActualQty(prev.qty_red_date, prev.actual_qty_red_date) +
      resolveActualQty(line.qty_red_date, line.actual_qty_red_date);
    const actualRock =
      resolveActualQty(prev.qty_rock_sugar, prev.actual_qty_rock_sugar) +
      resolveActualQty(line.qty_rock_sugar, line.actual_qty_rock_sugar);
    prev.qty_osmanthus += line.qty_osmanthus;
    prev.qty_red_date += line.qty_red_date;
    prev.qty_rock_sugar += line.qty_rock_sugar;
    prev.actual_qty_osmanthus = actualOsmanthus;
    prev.actual_qty_red_date = actualRed;
    prev.actual_qty_rock_sugar = actualRock;
  }
  return order.map((id) => map.get(id)!);
}

export type PrepLineSource = {
  capacity: PrepCapacity;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus?: number | null;
  actual_qty_red_date?: number | null;
  actual_qty_rock_sugar?: number | null;
  bird_nest_osmanthus?: string | null;
  bird_nest_red_date?: string | null;
  bird_nest_rock_sugar?: string | null;
  lines?: PrepCapacityLine[] | null;
  lines_json?: string | null;
};

function lineFromParent(order: PrepLineSource): PrepCapacityLine {
  return {
    capacity: order.capacity,
    qty_osmanthus: Math.max(0, order.qty_osmanthus || 0),
    qty_red_date: Math.max(0, order.qty_red_date || 0),
    qty_rock_sugar: Math.max(0, order.qty_rock_sugar || 0),
    actual_qty_osmanthus: order.actual_qty_osmanthus ?? null,
    actual_qty_red_date: order.actual_qty_red_date ?? null,
    actual_qty_rock_sugar: order.actual_qty_rock_sugar ?? null,
    bird_nest_osmanthus: parseBirdNestType(order.bird_nest_osmanthus),
    bird_nest_red_date: parseBirdNestType(order.bird_nest_red_date),
    bird_nest_rock_sugar: parseBirdNestType(order.bird_nest_rock_sugar),
  };
}

/** Capacity lines for an order. Legacy rows with no JSON become a single line from the parent columns. */
export function prepOrderLines(order: PrepLineSource): PrepCapacityLine[] {
  if (order.lines && order.lines.length > 0) {
    const lines = order.lines
      .map((line) => normalizePrepCapacityLine(line))
      .filter((line): line is PrepCapacityLine => line != null);
    if (lines.length) return lines;
  }
  const parsed = parsePrepLinesJson(order.lines_json);
  if (parsed && parsed.length) return parsed;
  return [lineFromParent(order)];
}

export function isMultiCapacityPrep(order: PrepLineSource): boolean {
  return prepOrderLines(order).length > 1;
}

function birdNestForPrepLine(
  order: {
    bird_nest_osmanthus?: string | null;
    bird_nest_red_date?: string | null;
    bird_nest_rock_sugar?: string | null;
  },
  line: PrepCapacityLine
): PrepBirdNestSelections {
  return prepOrderBirdNestSelections({
    bird_nest_osmanthus: line.bird_nest_osmanthus ?? order.bird_nest_osmanthus,
    bird_nest_red_date: line.bird_nest_red_date ?? order.bird_nest_red_date,
    bird_nest_rock_sugar: line.bird_nest_rock_sugar ?? order.bird_nest_rock_sugar,
  });
}

export interface PrepLineParentMirror {
  capacity: PrepCapacity;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus: number;
  actual_qty_red_date: number;
  actual_qty_rock_sugar: number;
  bird_nest_osmanthus: BirdNestType;
  bird_nest_red_date: BirdNestType;
  bird_nest_rock_sugar: BirdNestType;
}

/** Parent columns mirror the first line so older single-capacity readers stay coherent. */
export function parentMirrorFromLines(lines: PrepCapacityLine[]): PrepLineParentMirror {
  const first = lines[0];
  return {
    capacity: first.capacity,
    qty_osmanthus: first.qty_osmanthus,
    qty_red_date: first.qty_red_date,
    qty_rock_sugar: first.qty_rock_sugar,
    actual_qty_osmanthus: resolveActualQty(first.qty_osmanthus, first.actual_qty_osmanthus),
    actual_qty_red_date: resolveActualQty(first.qty_red_date, first.actual_qty_red_date),
    actual_qty_rock_sugar: resolveActualQty(first.qty_rock_sugar, first.actual_qty_rock_sugar),
    bird_nest_osmanthus: first.bird_nest_osmanthus ?? 'large',
    bird_nest_red_date: first.bird_nest_red_date ?? 'large',
    bird_nest_rock_sugar: first.bird_nest_rock_sugar ?? 'large',
  };
}

export function orderWithPrepLines<T extends PrepLineSource>(order: T, lines: PrepCapacityLine[]): T & { lines: PrepCapacityLine[] } {
  const parent = parentMirrorFromLines(lines);
  return { ...order, ...parent, lines };
}

export interface PlannedPrepLines {
  lines: PrepCapacityLine[];
  /** Null when a single capacity is stored on the parent columns only. */
  linesJson: string | null;
  parent: PrepLineParentMirror;
}

/**
 * Normalize a create/update payload into capacity lines.
 * One line → linesJson null (legacy shape). Two or more → JSON on the same prep order.
 */
export function planPrepCapacityLines(
  rawLines: PrepCapacityLineDraft[],
  opts?: { formulas?: StewFormulaMapLike; allowEmpty?: boolean }
): { ok: true; plan: PlannedPrepLines } | { ok: false; error: string } {
  const formulas = opts?.formulas ?? CAPACITY_FLAVOR_FORMULAS;
  const normalized: PrepCapacityLine[] = [];
  for (const raw of rawLines) {
    const line = normalizePrepCapacityLine(raw);
    if (!line) continue;
    if (!isRedDateAllowed(line.capacity, formulas)) {
      line.qty_red_date = 0;
      if (line.actual_qty_red_date != null) line.actual_qty_red_date = 0;
    }
    normalized.push(line);
  }
  const lines = mergePrepCapacityLines(normalized);
  if (lines.length === 0) {
    return { ok: false, error: 'At least one capacity line is required' };
  }
  for (const line of lines) {
    const err = validatePrepFlavorQtys(line.capacity, prepOrderQtys(line), {
      allowEmpty: Boolean(opts?.allowEmpty),
      formulas,
    });
    if (err) return { ok: false, error: err };
  }
  return {
    ok: true,
    plan: {
      lines,
      linesJson: lines.length > 1 ? JSON.stringify(lines) : null,
      parent: parentMirrorFromLines(lines),
    },
  };
}

/**
 * One order code for a whole batch. Capacity is never appended (`#12345`, not `#12345-45g`).
 */
export function planPrepBatchOrderCode(requestedCode: string | null | undefined, autoCode: string): string {
  const requested = requestedCode?.trim();
  if (requested) return requested;
  return autoCode.trim();
}

/** Grams label. Millilitre text is shown in grams. 75g jar shapes stay distinct. */
export function capacityGramsLabel(capacity: PrepCapacity): string {
  const labeled = (PREP_CAPACITY_LABELS[capacity] || String(capacity || '')).trim();
  const grams = labeled.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (grams) return `${grams[1]}g`;
  const ml = labeled.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) return `${ml[1]}g`;
  return labeled.replace(/ml/gi, 'g');
}

/** Tag used in `#12104 - 桂花 x40 (45g)`. */
export function capacityScheduleTag(capacity: PrepCapacity): string {
  if (capacity === '75g_big_belly') return '75g 大肚樽';
  if (capacity === '75g') return '75g';
  return capacityGramsLabel(capacity);
}

export function formatPrepScheduleLine(
  orderCode: string,
  capacity: PrepCapacity,
  flavor: PrepFlavor,
  qty: number
): string {
  return `${orderCode.trim()} - ${PREP_FLAVOR_SHORT[flavor]} x${qty} (${capacityScheduleTag(capacity)})`;
}

export function formatPrepOrderScheduleLines(order: PrepLineSource & { order_code: string }): string[] {
  const out: string[] = [];
  for (const line of prepOrderLines(order)) {
    const pairs: Array<[PrepFlavor, number]> = [
      ['osmanthus', line.qty_osmanthus],
      ['red_date', line.qty_red_date],
      ['rock_sugar', line.qty_rock_sugar],
    ];
    for (const [flavor, qty] of pairs) {
      if (qty > 0) out.push(formatPrepScheduleLine(order.order_code, line.capacity, flavor, qty));
    }
  }
  return out;
}

export interface PrepCapacitySummaryLine {
  capacity: PrepCapacity;
  label: string;
  /** Flavors in one capacity, joined with `｜`. */
  text: string;
  bottles: number;
}

/** Group bottle counts by capacity. Flavors inside one capacity join with `｜`. */
export function summarizePrepCapacityLines(lines: PrepCapacityLine[]): PrepCapacitySummaryLine[] {
  const order: PrepCapacity[] = [];
  const grouped = new Map<PrepCapacity, Record<PrepFlavor, number>>();
  for (const line of lines) {
    if (!grouped.has(line.capacity)) {
      order.push(line.capacity);
      grouped.set(line.capacity, { osmanthus: 0, red_date: 0, rock_sugar: 0 });
    }
    const g = grouped.get(line.capacity)!;
    g.osmanthus += Math.max(0, line.qty_osmanthus || 0);
    g.red_date += Math.max(0, line.qty_red_date || 0);
    g.rock_sugar += Math.max(0, line.qty_rock_sugar || 0);
  }
  return order
    .map((capacity) => {
      const g = grouped.get(capacity)!;
      const parts = PREP_FLAVORS.filter((flavor) => g[flavor] > 0).map(
        (flavor) => `${PREP_FLAVOR_SHORT[flavor]} x${g[flavor]}`
      );
      const bottles = PREP_FLAVORS.reduce((sum, flavor) => sum + g[flavor], 0);
      return {
        capacity,
        label: capacityScheduleTag(capacity),
        text: parts.join('｜'),
        bottles,
      };
    })
    .filter((line) => line.bottles > 0);
}

export function summarizePrepOrderLines(order: PrepLineSource): PrepCapacitySummaryLine[] {
  return summarizePrepCapacityLines(prepOrderLines(order));
}

const LARGE_POT_CAPACITIES = new Set(['75g', '75g_big_belly']);

export function stewPotLimitForCapacity(capacity: PrepCapacity): number {
  if (LARGE_POT_CAPACITIES.has(capacity) || capacity.startsWith('75g')) return STEW_POT_LIMIT_LARGE;
  return STEW_POT_LIMIT_SMALL;
}

export interface SessionPotBucket {
  id: string;
  label: string;
  limit: number;
  bottles: number;
  /** True only for the dedicated 75g+45g mixed pot. */
  mixed: boolean;
}

/**
 * Pot check for one stewing session.
 * Each capacity is checked against its own 150 or 100 limit.
 * When both a 75g jar and 45g are in the session, a separate mixed bucket uses 120.
 * That mixed total is not written back onto the 150 or 100 buckets.
 */
export function sessionPotBuckets(
  entries: Array<{ capacity: PrepCapacity; bottles: number }>
): SessionPotBucket[] {
  const byCap = new Map<string, number>();
  for (const entry of entries) {
    const bottles = Math.max(0, Math.round(entry.bottles || 0));
    if (!entry.capacity || bottles <= 0) continue;
    byCap.set(entry.capacity, (byCap.get(entry.capacity) || 0) + bottles);
  }
  const buckets: SessionPotBucket[] = [];
  for (const [capacity, bottles] of Array.from(byCap.entries())) {
    buckets.push({
      id: capacity,
      label: capacityScheduleTag(capacity),
      limit: stewPotLimitForCapacity(capacity),
      bottles,
      mixed: false,
    });
  }
  let large = 0;
  let g45 = 0;
  for (const [capacity, bottles] of Array.from(byCap.entries())) {
    if (capacity === '45g') g45 += bottles;
    else if (LARGE_POT_CAPACITIES.has(capacity) || capacity.startsWith('75g')) large += bottles;
  }
  if (large > 0 && g45 > 0) {
    buckets.push({
      id: 'mixed-75g-45g',
      label: '75g+45g',
      limit: STEW_POT_LIMIT_MIXED_75_45,
      bottles: large + g45,
      mixed: true,
    });
  }
  return buckets;
}

export interface PrepSessionSummary {
  /** `${stewingDate}|AM`, `|PM`, or `|unset`. */
  sessionKey: string;
  stewingDate: string;
  /** Null for the unset bucket. Those orders are not mixed into AM or PM pot totals. */
  scheduleSlot: PrepScheduleSlot | null;
  lines: PrepCapacitySummaryLine[];
  potBuckets: SessionPotBucket[];
}

export type PrepBoardSortKey = 'stewing_date' | 'order_code' | 'capacity' | 'status';

/**
 * List order for the prep board.
 * Days follow the stewing-date sort (other column sorts keep days ascending).
 * Inside a day the session order is always AM, then PM, then unset.
 * The chosen column sort applies only inside a session. Ties break on id
 * so the order stays stable. Date descending does not swap AM and PM.
 */
export function sortPrepOrdersForBoard<
  T extends {
    id: number;
    stewing_date: string;
    schedule_slot?: string | null;
    order_code: string;
    status: string;
    capacity: string;
  },
>(
  orders: T[],
  sortKey: PrepBoardSortKey,
  sortDir: 'asc' | 'desc',
  capacitySortKey: (order: T) => string = (order) => order.capacity,
): T[] {
  const list = [...orders];
  list.sort((a, b) => {
    const dateCmp = a.stewing_date.localeCompare(b.stewing_date);
    const dateOrdered = sortKey === 'stewing_date' && sortDir === 'desc' ? -dateCmp : dateCmp;
    if (dateOrdered !== 0) return dateOrdered;
    const slotCmp =
      prepScheduleSlotRank(parsePrepScheduleSlot(a.schedule_slot)) -
      prepScheduleSlotRank(parsePrepScheduleSlot(b.schedule_slot));
    if (slotCmp !== 0) return slotCmp;
    let cmp = a.id - b.id;
    if (sortKey === 'order_code') cmp = a.order_code.localeCompare(b.order_code);
    else if (sortKey === 'capacity') cmp = capacitySortKey(a).localeCompare(capacitySortKey(b));
    else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
    if (cmp === 0) cmp = a.id - b.id;
    if (sortKey === 'stewing_date') return cmp;
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return list;
}

/**
 * Pot totals for the prep board.
 * One card per stewing date + AM/PM. Orders with no session stay in a separate
 * unset bucket for that date, so they are not counted against the AM or PM
 * pot limits. Pot math is unchanged (25g/45g 150, 75g 100, mixed 75g+45g 120);
 * only the grouping key changed. Group order follows the input order.
 */
export function summarizePrepSessions(
  orders: Array<PrepLineSource & { stewing_date: string; schedule_slot?: string | null }>
): PrepSessionSummary[] {
  const byKey = new Map<string, PrepCapacityLine[]>();
  const meta = new Map<string, { stewingDate: string; scheduleSlot: PrepScheduleSlot | null }>();
  const keyOrder: string[] = [];
  for (const order of orders) {
    const scheduleSlot = parsePrepScheduleSlot(order.schedule_slot);
    const key = prepSessionGroupKey(order.stewing_date || '', scheduleSlot);
    if (!byKey.has(key)) {
      keyOrder.push(key);
      byKey.set(key, []);
      meta.set(key, { stewingDate: order.stewing_date || '', scheduleSlot });
    }
    byKey.get(key)!.push(...prepOrderLines(order));
  }
  return keyOrder.map((sessionKey) => {
    const info = meta.get(sessionKey)!;
    const lines = summarizePrepCapacityLines(byKey.get(sessionKey) || []);
    return {
      sessionKey,
      stewingDate: info.stewingDate,
      scheduleSlot: info.scheduleSlot,
      lines,
      potBuckets: sessionPotBuckets(lines.map((line) => ({ capacity: line.capacity, bottles: line.bottles }))),
    };
  });
}

export interface PrepBoardGroup<T> {
  sessionKey: string;
  stewingDate: string;
  scheduleSlot: PrepScheduleSlot | null;
  orders: T[];
  summary: PrepSessionSummary;
}

/** Date → AM / PM / unset groups. Input order is the group order and the row order. */
export function groupPrepOrdersForBoard<
  T extends PrepLineSource & { stewing_date: string; schedule_slot?: string | null },
>(orders: T[]): PrepBoardGroup<T>[] {
  const groups: PrepBoardGroup<T>[] = [];
  const index = new Map<string, PrepBoardGroup<T>>();
  for (const order of orders) {
    const scheduleSlot = parsePrepScheduleSlot(order.schedule_slot);
    const sessionKey = prepSessionGroupKey(order.stewing_date || '', scheduleSlot);
    let group = index.get(sessionKey);
    if (!group) {
      group = {
        sessionKey,
        stewingDate: order.stewing_date || '',
        scheduleSlot,
        orders: [],
        summary: {
          sessionKey,
          stewingDate: order.stewing_date || '',
          scheduleSlot,
          lines: [],
          potBuckets: [],
        },
      };
      index.set(sessionKey, group);
      groups.push(group);
    }
    group.orders.push(order);
  }
  for (const group of groups) {
    const [summary] = summarizePrepSessions(group.orders);
    if (summary) group.summary = summary;
  }
  return groups;
}

export interface PrepBoardDay<T> {
  stewingDate: string;
  sessions: PrepBoardGroup<T>[];
  orders: T[];
}

/** Calendar days wrapping the AM / PM / unset session groups. Input order is kept. */
export function groupPrepDaysForBoard<
  T extends PrepLineSource & { stewing_date: string; schedule_slot?: string | null },
>(orders: T[]): PrepBoardDay<T>[] {
  const days: PrepBoardDay<T>[] = [];
  const index = new Map<string, PrepBoardDay<T>>();
  for (const session of groupPrepOrdersForBoard(orders)) {
    let day = index.get(session.stewingDate);
    if (!day) {
      day = { stewingDate: session.stewingDate, sessions: [], orders: [] };
      index.set(session.stewingDate, day);
      days.push(day);
    }
    day.sessions.push(session);
    day.orders.push(...session.orders);
  }
  return days;
}

export interface DayMaterialLine {
  capacity: PrepCapacity;
  flavor: PrepFlavor;
  label: string;
  bottles: number;
  birdNest: number;
  osmanthus: number;
  redDate: number;
  rockSugar: number;
  slabSugar: number;
  /** Grams of 水(煮糖) from the catalog formula. 0 when that per-bottle amount is 0. */
  boilSugar: number;
  /** Grams of 水(冷泡). Default catalog sets this on 桂花 only. */
  coldSoak: number;
}

export interface DayMaterialsOrderChip {
  id: number;
  orderCode: string;
  scheduleSlot: PrepScheduleSlot | null;
  bottles: number;
  orderType: PrepOrderType;
  /** Compact 今次 qty, e.g. `45g 桂60+紅60`. */
  detail: string;
}

export interface DayMaterialsSummary {
  stewingDate: string;
  lines: DayMaterialLine[];
  totals: {
    bottles: number;
    birdNest: number;
    osmanthus: number;
    redDate: number;
    rockSugar: number;
    slabSugar: number;
    boilSugar: number;
    coldSoak: number;
  };
  orders: DayMaterialsOrderChip[];
  slotBottles: { AM: number; PM: number; unset: number };
}

type DayMaterialsOrder = PrepLineSource & {
  id?: number;
  order_code?: string;
  order_type: PrepOrderType;
  stewing_date: string;
  schedule_slot?: string | null;
};

function prepCapacityRank(capacity: string): number {
  const index = PREP_CAPACITIES.indexOf(capacity as (typeof PREP_CAPACITIES)[number]);
  return index < 0 ? PREP_CAPACITIES.length : index;
}

const DAY_FLAVOR_MARK: Record<PrepFlavor, string> = {
  osmanthus: '桂',
  red_date: '紅',
  rock_sugar: '冰',
};

/** Jar shape on the day sheet. 75g 高身 and 大肚 stay distinct. */
export function dayMaterialsCapacityLabel(capacity: PrepCapacity): string {
  if (capacity === '75g') return '75g（高身）';
  if (capacity === '75g_big_belly') return '75g（大肚）';
  return capacityScheduleTag(capacity);
}

/** Compact 今次 line for the day sheet order list, e.g. `45g 桂60+紅60 · 25g 冰25`. */
export function formatDayMaterialsOrderDetail(order: PrepLineSource): string {
  const parts: string[] = [];
  for (const line of prepOrderLines(order)) {
    const bits: string[] = [];
    const qtys: Record<PrepFlavor, number> = {
      osmanthus: line.qty_osmanthus,
      red_date: line.qty_red_date,
      rock_sugar: line.qty_rock_sugar,
    };
    for (const flavor of PREP_FLAVORS) {
      const qty = Math.max(0, Math.round(Number(qtys[flavor]) || 0));
      if (qty > 0) bits.push(`${DAY_FLAVOR_MARK[flavor]}${qty}`);
    }
    if (bits.length) parts.push(`${dayMaterialsCapacityLabel(line.capacity)} ${bits.join('+')}`);
  }
  return parts.join(' · ');
}

const PREP_WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

/** `2026-10-27 星期二 · 全日`. Parses the date as a calendar day, not UTC midnight. */
export function formatPrepDayHeading(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return iso || '—';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso;
  return `${iso} ${PREP_WEEKDAYS[date.getDay()]} · 全日`;
}

/** Slots that actually appear, in AM → PM → unset order. */
export function formatPrepDaySlotCoverage(slots: Array<PrepScheduleSlot | null | undefined>): string {
  let am = false;
  let pm = false;
  let unset = false;
  for (const slot of slots) {
    if (slot === 'AM') am = true;
    else if (slot === 'PM') pm = true;
    else unset = true;
  }
  const parts: string[] = [];
  if (am) parts.push('AM');
  if (pm) parts.push('PM');
  if (unset) parts.push('未設定');
  return parts.join(' + ') || '—';
}

export function formatPrepDayOrderTypes(types: Array<PrepOrderType | null | undefined>): string {
  const unique: PrepOrderType[] = [];
  for (const type of types) {
    if (!type || unique.includes(type)) continue;
    unique.push(type);
  }
  if (!unique.length) return '—';
  return unique.map((type) => PREP_ORDER_TYPE_LABELS[type]).join(' · ');
}

/** Drop actual-production extras so grams follow 今次 order qty, same as a prep sheet. */
function prepOrderAtOrderQty<T extends PrepLineSource>(order: T): T {
  const lines = prepOrderLines(order).map((line) => ({
    ...line,
    actual_qty_osmanthus: null,
    actual_qty_red_date: null,
    actual_qty_rock_sugar: null,
  }));
  return {
    ...order,
    actual_qty_osmanthus: null,
    actual_qty_red_date: null,
    actual_qty_rock_sugar: null,
    lines,
  };
}

/**
 * Combined materials for one stewing date.
 * Sums 今次 order quantities across AM, PM, and unset. Completed orders count,
 * because morning prep still needs the whole day's plan. Actual extras do not.
 */
export function summarizeDayMaterials(
  orders: DayMaterialsOrder[],
  formulas: StewFormulaMapLike = CAPACITY_FLAVOR_FORMULAS,
): DayMaterialsSummary {
  const byKey = new Map<string, DayMaterialLine>();
  const ordersOut: DayMaterialsOrderChip[] = [];
  const slotBottles = { AM: 0, PM: 0, unset: 0 };
  const totals = {
    bottles: 0,
    birdNest: 0,
    osmanthus: 0,
    redDate: 0,
    rockSugar: 0,
    slabSugar: 0,
    boilSugar: 0,
    coldSoak: 0,
  };

  for (const order of orders) {
    const calc = computePrepCalculationForOrder(prepOrderAtOrderQty(order), formulas);
    let orderBottles = 0;
    for (const row of calc.rows) {
      if (row.disabled || row.orderQty <= 0) continue;
      const capacity = row.capacity || order.capacity;
      const grams = row.ingredientGrams || {};
      const piece: DayMaterialLine = {
        capacity,
        flavor: row.flavor,
        label: PREP_FLAVOR_SHORT[row.flavor],
        bottles: row.orderQty,
        birdNest: row.birdNestGrams || 0,
        osmanthus: grams['桂花'] || 0,
        redDate: grams['紅棗'] || 0,
        rockSugar: grams['冰糖'] || 0,
        slabSugar: grams['片糖'] || 0,
        boilSugar: grams[STEW_WATER_BOIL_SUGAR] || 0,
        coldSoak: grams[STEW_WATER_COLD_SOAK] || 0,
      };
      const key = `${capacity}:${row.flavor}`;
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, piece);
      else {
        prev.bottles += piece.bottles;
        prev.birdNest = round2(prev.birdNest + piece.birdNest);
        prev.osmanthus = round2(prev.osmanthus + piece.osmanthus);
        prev.redDate = round2(prev.redDate + piece.redDate);
        prev.rockSugar = round2(prev.rockSugar + piece.rockSugar);
        prev.slabSugar = round2(prev.slabSugar + piece.slabSugar);
        prev.boilSugar = round2(prev.boilSugar + piece.boilSugar);
        prev.coldSoak = round2(prev.coldSoak + piece.coldSoak);
      }
      orderBottles += piece.bottles;
      totals.bottles += piece.bottles;
      totals.birdNest = round2(totals.birdNest + piece.birdNest);
      totals.osmanthus = round2(totals.osmanthus + piece.osmanthus);
      totals.redDate = round2(totals.redDate + piece.redDate);
      totals.rockSugar = round2(totals.rockSugar + piece.rockSugar);
      totals.slabSugar = round2(totals.slabSugar + piece.slabSugar);
      totals.boilSugar = round2(totals.boilSugar + piece.boilSugar);
      totals.coldSoak = round2(totals.coldSoak + piece.coldSoak);
    }
    const slot = parsePrepScheduleSlot(order.schedule_slot);
    if (slot === 'AM' || slot === 'PM') slotBottles[slot] += orderBottles;
    else slotBottles.unset += orderBottles;
    ordersOut.push({
      id: order.id ?? 0,
      orderCode: order.order_code || '',
      scheduleSlot: slot,
      bottles: orderBottles,
      orderType: order.order_type,
      detail: formatDayMaterialsOrderDetail(order),
    });
  }

  const lines = Array.from(byKey.values()).sort((a, b) => {
    const cap = prepCapacityRank(a.capacity) - prepCapacityRank(b.capacity);
    if (cap !== 0) return cap;
    return PREP_FLAVORS.indexOf(a.flavor) - PREP_FLAVORS.indexOf(b.flavor);
  });

  return {
    stewingDate: orders[0]?.stewing_date || '',
    lines,
    totals,
    orders: ordersOut,
    slotBottles,
  };
}

export type DaySugarWaterBoxKey =
  | 'boilSugar'
  | 'coldSoak'
  | 'slabSugar'
  | 'osmanthus'
  | 'rockSugar'
  | 'redDate';

export interface DaySugarWaterBox {
  key: DaySugarWaterBoxKey;
  label: string;
  amount: number;
  highlight: boolean;
}

export interface DaySugarWaterGroup {
  id: 'osmanthus' | 'combo';
  title: string;
  subtitle: string;
  bottles: number;
  /** e.g. `紅130 + 冰25`. Empty for the osmanthus group. */
  bottleNote: string;
  rows: DayMaterialLine[];
  birdNest: number;
  osmanthus: number;
  redDate: number;
  rockSugar: number;
  slabSugar: number;
  boilSugar: number;
  /**
   * Cold-soak grams. The combined 紅棗＋冰糖 group always leaves this at 0
   * and does not render a cold-soak column or box.
   */
  coldSoak: number;
  boxes: DaySugarWaterBox[];
}

export interface DaySugarWaterFooter {
  bottles: number;
  birdNest: number;
  osmanthusBoil: number;
  comboBoil: number;
  boilSugar: number;
  osmanthusColdSoak: number;
}

export interface DaySugarWaterSheet {
  groups: DaySugarWaterGroup[];
  footer: DaySugarWaterFooter;
}

function sumDayMaterialLines(lines: DayMaterialLine[]) {
  const totals = {
    bottles: 0,
    birdNest: 0,
    osmanthus: 0,
    redDate: 0,
    rockSugar: 0,
    slabSugar: 0,
    boilSugar: 0,
    coldSoak: 0,
  };
  for (const line of lines) {
    totals.bottles += line.bottles;
    totals.birdNest = round2(totals.birdNest + line.birdNest);
    totals.osmanthus = round2(totals.osmanthus + line.osmanthus);
    totals.redDate = round2(totals.redDate + line.redDate);
    totals.rockSugar = round2(totals.rockSugar + line.rockSugar);
    totals.slabSugar = round2(totals.slabSugar + line.slabSugar);
    totals.boilSugar = round2(totals.boilSugar + line.boilSugar);
    totals.coldSoak = round2(totals.coldSoak + line.coldSoak);
  }
  return totals;
}

/**
 * Day sheet sugar-water groups.
 * ① 桂花 is its own pot (boil + cold soak).
 * ② 紅棗 and 冰糖 share one pot: boil sugar only, no cold soak.
 * Both groups are always returned so an empty flavor still shows its boxes.
 */
export function buildDaySugarWaterSheet(summary: DayMaterialsSummary): DaySugarWaterSheet {
  const osmanthusRows = summary.lines
    .filter((line) => line.flavor === 'osmanthus' && line.bottles > 0)
    .sort((a, b) => prepCapacityRank(a.capacity) - prepCapacityRank(b.capacity));
  const comboRows = summary.lines
    .filter((line) => (line.flavor === 'red_date' || line.flavor === 'rock_sugar') && line.bottles > 0)
    .sort((a, b) => {
      const flavor = PREP_FLAVORS.indexOf(a.flavor) - PREP_FLAVORS.indexOf(b.flavor);
      if (flavor !== 0) return flavor;
      return prepCapacityRank(a.capacity) - prepCapacityRank(b.capacity);
    });

  const osmanthus = sumDayMaterialLines(osmanthusRows);
  const combo = sumDayMaterialLines(comboRows);
  const redBottles = comboRows
    .filter((line) => line.flavor === 'red_date')
    .reduce((sum, line) => sum + line.bottles, 0);
  const rockBottles = comboRows
    .filter((line) => line.flavor === 'rock_sugar')
    .reduce((sum, line) => sum + line.bottles, 0);
  const bottleBits: string[] = [];
  if (redBottles > 0) bottleBits.push(`紅${redBottles}`);
  if (rockBottles > 0) bottleBits.push(`冰${rockBottles}`);

  const groups: DaySugarWaterGroup[] = [
    {
      id: 'osmanthus',
      title: '① 桂花 Osmanthus',
      subtitle: '糖水組（獨立）',
      bottleNote: '',
      rows: osmanthusRows,
      ...osmanthus,
      boxes: [
        { key: 'boilSugar', label: '要準備糖水量（煮糖）', amount: osmanthus.boilSugar, highlight: true },
        { key: 'coldSoak', label: '冷泡水', amount: osmanthus.coldSoak, highlight: true },
        { key: 'slabSugar', label: '片糖', amount: osmanthus.slabSugar, highlight: false },
        { key: 'osmanthus', label: '桂花乾', amount: osmanthus.osmanthus, highlight: false },
      ],
    },
    {
      id: 'combo',
      title: '② 紅棗 + 冰糖',
      subtitle: '合埋一組糖水',
      bottleNote: bottleBits.join(' + '),
      rows: comboRows,
      ...combo,
      coldSoak: 0,
      boxes: [
        {
          key: 'boilSugar',
          label: '要準備糖水量（煮糖）· 合組總計',
          amount: combo.boilSugar,
          highlight: true,
        },
        { key: 'rockSugar', label: '冰糖（入糖水）合計', amount: combo.rockSugar, highlight: false },
        { key: 'redDate', label: '紅棗', amount: combo.redDate, highlight: false },
      ],
    },
  ];

  return {
    groups,
    footer: {
      bottles: summary.totals.bottles,
      birdNest: summary.totals.birdNest,
      osmanthusBoil: osmanthus.boilSugar,
      comboBoil: combo.boilSugar,
      boilSugar: round2(osmanthus.boilSugar + combo.boilSugar),
      osmanthusColdSoak: osmanthus.coldSoak,
    },
  };
}

function mergePrepCalculations(orderType: PrepOrderType, parts: PrepCalculation[]): PrepCalculation {
  const rows = parts.flatMap((part) =>
    part.rows.map((row) => ({ ...row, capacity: row.capacity || part.capacity }))
  );
  const ingredientGrams: Record<string, number> = {};
  for (const part of parts) {
    for (const [name, qty] of Object.entries(part.totals.ingredientGrams || {})) {
      ingredientGrams[name] = round2((ingredientGrams[name] || 0) + qty);
    }
  }
  const bottles = parts.reduce((sum, part) => sum + part.totals.bottles, 0);
  return {
    capacity: parts[0]?.capacity ?? '45g',
    capacities: parts.map((part) => part.capacity),
    orderType,
    formulaReady: parts.every((part) => part.formulaReady),
    rows,
    totals: {
      bottles,
      ingredientGrams,
      birdNestGrams: totalBirdNestGrams(ingredientGrams),
      flavorGrams: round2((ingredientGrams['桂花'] || 0) + (ingredientGrams['紅棗'] || 0)),
      rockSugarGrams: ingredientGrams['冰糖'] || 0,
      slabSugarGrams: ingredientGrams['片糖'] || 0,
    },
  };
}

export function prepOrderTotalOrderQty(order: PrepLineSource): number {
  return prepOrderLines(order).reduce((sum, line) => sum + originalOrderQuantity(prepOrderQtys(line)), 0);
}

export function sumRawNeedLines(groups: { name: string; qty: number }[][]): { name: string; qty: number }[] {
  const acc: Record<string, number> = {};
  for (const group of groups) {
    for (const line of group) {
      const name = (line.name || '').trim();
      if (!name || !(line.qty > 0)) continue;
      acc[name] = round2((acc[name] || 0) + line.qty);
    }
  }
  return Object.keys(acc)
    .filter((name) => (acc[name] || 0) > 0)
    .map((name) => ({ name, qty: acc[name] }));
}

/**
 * Customer-order key shared by split stew batches.
 * `#12105-45g` and `#12105-02單` both belong to `#12105`.
 */
export function prepCustomerOrderKey(orderCode: string): string {
  return String(orderCode || '')
    .trim()
    .replace(/-\d{2}單$/, '')
    .replace(/-(25g|45g|75g|75g_big_belly)$/i, '');
}

export interface PrepBatchSibling {
  id: number;
  order_code: string;
  stewing_date: string;
  status: PrepStatus;
  capacity: PrepCapacity;
  qty_osmanthus: number;
  qty_red_date: number;
  qty_rock_sugar: number;
  actual_qty_osmanthus?: number | null;
  actual_qty_red_date?: number | null;
  actual_qty_rock_sugar?: number | null;
  bird_nest_osmanthus?: string | null;
  bird_nest_red_date?: string | null;
  bird_nest_rock_sugar?: string | null;
  lines?: PrepCapacityLine[] | null;
  lines_json?: string | null;
  completion_splits?: PrepCompletionSplit[] | null;
}

export interface PrepBatchView {
  /** `#12105-02單` when this order is one of several stew batches. Null for a single batch. */
  label: string | null;
  index: number;
  count: number;
  /** Bottles already stewed on earlier completed batches of the same customer order. */
  priorLines: PrepCapacityLine[];
}

function stewedLinesFromBatch(order: PrepBatchSibling): PrepCapacityLine[] {
  const source = prepOrderLines(order);
  const splits = (order.completion_splits || []).filter(
    (split) => Boolean(split.flavor) && Math.round(Number(split.qty) || 0) > 0
  );
  if (splits.length > 0) {
    const grouped = new Map<string, PrepCapacityLine>();
    for (const split of splits) {
      const capacity = split.capacity || order.capacity;
      const flavor = split.flavor as PrepFlavor;
      let line = grouped.get(capacity);
      if (!line) {
        const match = source.find((row) => row.capacity === capacity);
        line = {
          capacity,
          qty_osmanthus: 0,
          qty_red_date: 0,
          qty_rock_sugar: 0,
          bird_nest_osmanthus: match?.bird_nest_osmanthus,
          bird_nest_red_date: match?.bird_nest_red_date,
          bird_nest_rock_sugar: match?.bird_nest_rock_sugar,
        };
        grouped.set(capacity, line);
      }
      const qty = Math.max(0, Math.round(Number(split.qty) || 0));
      if (flavor === 'osmanthus') line.qty_osmanthus += qty;
      else if (flavor === 'red_date') line.qty_red_date += qty;
      else if (flavor === 'rock_sugar') line.qty_rock_sugar += qty;
    }
    return Array.from(grouped.values());
  }
  return source.map((line) => ({
    capacity: line.capacity,
    qty_osmanthus: Math.max(0, line.qty_osmanthus || 0),
    qty_red_date: Math.max(0, line.qty_red_date || 0),
    qty_rock_sugar: Math.max(0, line.qty_rock_sugar || 0),
    bird_nest_osmanthus: line.bird_nest_osmanthus,
    bird_nest_red_date: line.bird_nest_red_date,
    bird_nest_rock_sugar: line.bird_nest_rock_sugar,
  }));
}

/** Earlier completed batches of the same customer order become 上單已燉. A lone order has no -0N單 suffix. */
export function resolvePrepBatch(currentId: number, siblings: PrepBatchSibling[]): PrepBatchView {
  const unique = new Map<number, PrepBatchSibling>();
  for (const row of siblings) unique.set(row.id, row);
  const rows = Array.from(unique.values()).sort((a, b) => {
    const date = String(a.stewing_date || '').localeCompare(String(b.stewing_date || ''));
    if (date !== 0) return date;
    return a.id - b.id;
  });
  let index = rows.findIndex((row) => row.id === currentId);
  if (index < 0) index = rows.length;
  const count = Math.max(rows.length, index + 1, 1);
  const current = rows.find((row) => row.id === currentId);
  const base = prepCustomerOrderKey(current?.order_code || '');
  const label = count > 1 && base ? `${base}-${String(index + 1).padStart(2, '0')}單` : null;
  const priorLines: PrepCapacityLine[] = [];
  for (const row of rows) {
    if (row.id === currentId) break;
    if (row.status !== 'completed') continue;
    priorLines.push(...stewedLinesFromBatch(row));
  }
  return { label, index, count, priorLines };
}

export interface PrepMaterialAmounts {
  birdNest: number;
  osmanthus: number;
  rockSugar: number;
  slabSugar: number;
  /** Grams of 水(煮糖) for 今次要燉. */
  boilSugarWater: number;
  /** Grams of 水(冷泡) for 今次要燉. */
  coldSoakWater: number;
  bottles: number;
}

export interface PrepMaterialsFlavorRow {
  flavor: PrepFlavor;
  label: string;
  prior: number;
  now: number;
  materials: PrepMaterialAmounts;
}

export type PrepMaterialsTone = 'warm' | 'cool' | 'slate';

export interface PrepMaterialsBox {
  capacity: PrepCapacity;
  title: string;
  flavorLabel: string;
  tone: PrepMaterialsTone;
  headerAside: string;
  rows: PrepMaterialsFlavorRow[];
  prior: number;
  now: number;
  materials: PrepMaterialAmounts;
}

export interface PrepMaterialsTable {
  batchLabel: string | null;
  boxes: PrepMaterialsBox[];
  prior: number;
  now: number;
  materials: PrepMaterialAmounts;
}

const EMPTY_MATERIALS: PrepMaterialAmounts = {
  birdNest: 0,
  osmanthus: 0,
  rockSugar: 0,
  slabSugar: 0,
  boilSugarWater: 0,
  coldSoakWater: 0,
  bottles: 0,
};

function addMaterials(into: PrepMaterialAmounts, extra: PrepMaterialAmounts): void {
  into.birdNest = round2(into.birdNest + extra.birdNest);
  into.osmanthus = round2(into.osmanthus + extra.osmanthus);
  into.rockSugar = round2(into.rockSugar + extra.rockSugar);
  into.slabSugar = round2(into.slabSugar + extra.slabSugar);
  into.boilSugarWater = round2(into.boilSugarWater + extra.boilSugarWater);
  into.coldSoakWater = round2(into.coldSoakWater + extra.coldSoakWater);
  into.bottles += extra.bottles;
}

function materialsForNowQty(
  capacity: PrepCapacity,
  flavor: PrepFlavor,
  qty: number,
  formulas: StewFormulaMapLike,
  birdNestType: BirdNestType
): PrepMaterialAmounts {
  if (qty <= 0) return { ...EMPTY_MATERIALS };
  const row = calcRow(flavor, qty, qty, capacity, formulas, birdNestType);
  const grams = row.ingredientGrams || {};
  const birdNest = round2(totalBirdNestGrams(grams) + (grams['燕餅'] || 0));
  return {
    birdNest,
    osmanthus: grams['桂花'] || 0,
    rockSugar: grams['冰糖'] || 0,
    slabSugar: grams['片糖'] || 0,
    // Water stays on the prep sheet. Raw-stock deduction still skips these lines.
    boilSugarWater: grams[STEW_WATER_BOIL_SUGAR] || 0,
    coldSoakWater: grams[STEW_WATER_COLD_SOAK] || 0,
    bottles: qty,
  };
}

function materialsTone(capacity: PrepCapacity): PrepMaterialsTone {
  if (capacity === '25g') return 'cool';
  if (String(capacity).startsWith('75g')) return 'slate';
  return 'warm';
}

function flavorQtyIndex(lines: PrepCapacityLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const qtys = prepOrderQtys(line);
    for (const flavor of PREP_FLAVORS) {
      const qty = qtys[flavor];
      if (qty <= 0) continue;
      const key = `${line.capacity}:${flavor}`;
      map.set(key, (map.get(key) || 0) + qty);
    }
  }
  return map;
}

/**
 * Materials table for one stew batch.
 * 今次要燉 is this order's ordered qty (not 實際 extras). Ingredient grams follow 今次 only.
 * 上單已燉 is prior completed batches; missing prior is 0.
 */
export function buildPrepMaterialsTable(
  order: PrepLineSource,
  priorLines: PrepCapacityLine[] = [],
  opts?: { batchLabel?: string | null; formulas?: StewFormulaMapLike }
): PrepMaterialsTable {
  const formulas = opts?.formulas ?? CAPACITY_FLAVOR_FORMULAS;
  const currentLines = prepOrderLines(order);
  const nowIndex = flavorQtyIndex(currentLines);
  const priorIndex = flavorQtyIndex(priorLines);
  const capacityOrder: PrepCapacity[] = [];
  const seen = new Set<string>();
  const pushCap = (capacity: PrepCapacity) => {
    if (!capacity || seen.has(capacity)) return;
    seen.add(capacity);
    capacityOrder.push(capacity);
  };
  for (const line of priorLines) pushCap(line.capacity);
  for (const line of currentLines) pushCap(line.capacity);

  const boxes: PrepMaterialsBox[] = [];
  const footerMaterials = { ...EMPTY_MATERIALS };
  let footerPrior = 0;
  let footerNow = 0;

  for (const capacity of capacityOrder) {
    const flavors = PREP_FLAVORS.filter((flavor) => {
      const key = `${capacity}:${flavor}`;
      return (nowIndex.get(key) || 0) > 0 || (priorIndex.get(key) || 0) > 0;
    });
    if (!flavors.length) continue;
    const sourceLine = currentLines.find((line) => line.capacity === capacity);
    const birdNest = sourceLine
      ? birdNestForPrepLine(order, sourceLine)
      : prepOrderBirdNestSelections(order);
    const rows: PrepMaterialsFlavorRow[] = flavors.map((flavor) => {
      const key = `${capacity}:${flavor}`;
      const now = nowIndex.get(key) || 0;
      const prior = priorIndex.get(key) || 0;
      return {
        flavor,
        label: PREP_FLAVOR_SHORT[flavor],
        prior,
        now,
        materials: materialsForNowQty(capacity, flavor, now, formulas, birdNest[flavor]),
      };
    });
    const materials = { ...EMPTY_MATERIALS };
    let prior = 0;
    let now = 0;
    for (const row of rows) {
      prior += row.prior;
      now += row.now;
      addMaterials(materials, row.materials);
    }
    const headerAside =
      prior > 0
        ? `今次要燉 ${now} · 上單已燉 ${prior}`
        : `今次要燉 ${now}`;
    const flavorLabel = flavors.map((flavor) => PREP_FLAVOR_SHORT[flavor]).join('｜');
    const title = `${capacityScheduleTag(capacity)} · ${flavorLabel}`;
    boxes.push({
      capacity,
      title,
      flavorLabel,
      tone: materialsTone(capacity),
      headerAside,
      rows,
      prior,
      now,
      materials,
    });
    footerPrior += prior;
    footerNow += now;
    addMaterials(footerMaterials, materials);
  }

  return {
    batchLabel: opts?.batchLabel ?? null,
    boxes,
    prior: footerPrior,
    now: footerNow,
    materials: footerMaterials,
  };
}

export function formatPrepMaterialAmount(qty: number): string {
  if (!qty) return '—';
  const rounded = round2(qty);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Day-sheet amount. Zero (including a 0 catalog water line) is an em dash, same as prep sheets. */
export function formatDayMaterialAmount(qty: number): string {
  if (!qty) return '—';
  const rounded = round2(qty);
  if (!rounded) return '—';
  const negative = rounded < 0;
  const fixed = Math.abs(rounded).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const [whole, frac] = fixed.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = frac ? `${withCommas}.${frac}` : withCommas;
  return negative ? `-${text}` : text;
}

/** Gram label for summary boxes. A zero amount stays `—` with no unit. */
export function formatDayMaterialGrams(qty: number): string {
  const text = formatDayMaterialAmount(qty);
  return text === '—' ? text : `${text} g`;
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
