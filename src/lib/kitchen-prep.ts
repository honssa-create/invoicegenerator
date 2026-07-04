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

/** Per-bottle ingredient weights (grams) — 45g 燕窩配方基準. */
export interface PrepFormulaPerBottle {
  birdNest: number;
  osmanthus: number;
  redDate: number;
  rockSugar: number;
  slabSugar: number;
}

export const FORMULA_45G: PrepFormulaPerBottle = {
  birdNest: 0.8,
  osmanthus: 0.13,
  redDate: 1.8,
  rockSugar: 3.57,
  slabSugar: 5.03,
};

/** Formulas by capacity — only 45g is configured; 25g / 75g pending from business. */
export const CAPACITY_FORMULAS: Partial<Record<PrepCapacity, PrepFormulaPerBottle>> = {
  '45g': FORMULA_45G,
};

export const WEDDING_BUFFER = 3;

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
  disabled?: boolean;
}

export interface PrepCalculation {
  capacity: PrepCapacity;
  orderType: PrepOrderType;
  formula: PrepFormulaPerBottle | null;
  formulaReady: boolean;
  rows: FlavorCalcRow[];
  totals: {
    bottles: number;
    birdNestGrams: number;
    rockSugarGrams: number;
    slabSugarGrams: number;
  };
}

export function isRedDateAllowed(capacity: PrepCapacity): boolean {
  return capacity !== '25g';
}

export function actualProductionQty(orderQty: number, orderType: PrepOrderType): number {
  const base = Math.max(0, orderQty);
  return orderType === 'wedding' ? base + WEDDING_BUFFER : base;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePrepCalculation(
  capacity: PrepCapacity,
  orderType: PrepOrderType,
  qtys: PrepFlavorQty
): PrepCalculation {
  const formula = CAPACITY_FORMULAS[capacity] ?? null;
  const flavorMap: { flavor: PrepFlavor; qty: number }[] = [
    { flavor: 'osmanthus', qty: qtys.osmanthus },
    { flavor: 'red_date', qty: qtys.red_date },
    { flavor: 'rock_sugar', qty: qtys.rock_sugar },
  ];

  const rows: FlavorCalcRow[] = flavorMap
    .filter(({ flavor, qty }) => qty > 0 || (flavor === 'red_date' && !isRedDateAllowed(capacity)))
    .map(({ flavor, qty }) => {
      const disabled = flavor === 'red_date' && !isRedDateAllowed(capacity);
      const orderQty = disabled ? 0 : qty;
      const weddingBuffer = orderType === 'wedding' && orderQty > 0 ? WEDDING_BUFFER : 0;
      const actualQty = actualProductionQty(orderQty, orderType);

      if (!formula) {
        return {
          flavor,
          label: PREP_FLAVOR_LABELS[flavor],
          orderQty,
          actualQty,
          weddingBuffer,
          birdNestGrams: 0,
          flavorGrams: 0,
          rockSugarGrams: 0,
          slabSugarGrams: 0,
          disabled,
        };
      }

      const flavorGrams =
        flavor === 'osmanthus'
          ? actualQty * formula.osmanthus
          : flavor === 'red_date'
            ? actualQty * formula.redDate
            : actualQty * formula.rockSugar;

      return {
        flavor,
        label: PREP_FLAVOR_LABELS[flavor],
        orderQty,
        actualQty,
        weddingBuffer,
        birdNestGrams: round2(actualQty * formula.birdNest),
        flavorGrams: round2(flavorGrams),
        rockSugarGrams: round2(actualQty * formula.rockSugar),
        slabSugarGrams: round2(actualQty * formula.slabSugar),
        disabled,
      };
    });

  // Include zero-qty flavor rows that are still relevant for display when all zero
  if (rows.length === 0) {
    for (const flavor of PREP_FLAVORS) {
      const disabled = flavor === 'red_date' && !isRedDateAllowed(capacity);
      rows.push({
        flavor,
        label: PREP_FLAVOR_LABELS[flavor],
        orderQty: 0,
        actualQty: 0,
        weddingBuffer: 0,
        birdNestGrams: 0,
        flavorGrams: 0,
        rockSugarGrams: 0,
        slabSugarGrams: 0,
        disabled,
      });
    }
  }

  const activeRows = rows.filter((r) => r.orderQty > 0 && !r.disabled);
  const totals = {
    bottles: activeRows.reduce((s, r) => s + r.actualQty, 0),
    birdNestGrams: round2(activeRows.reduce((s, r) => s + r.birdNestGrams, 0)),
    rockSugarGrams: round2(activeRows.reduce((s, r) => s + r.rockSugarGrams, 0)),
    slabSugarGrams: round2(activeRows.reduce((s, r) => s + r.slabSugarGrams, 0)),
  };

  return {
    capacity,
    orderType,
    formula,
    formulaReady: formula !== null,
    rows: rows.filter((r) => r.orderQty > 0 || !r.disabled),
    totals,
  };
}

export function formatGrams(n: number): string {
  return `${n.toFixed(2)}g`;
}
