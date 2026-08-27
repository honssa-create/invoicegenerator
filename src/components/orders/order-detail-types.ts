import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type {
  CupmokaLineItem,
  HonourLineItem,
  HonourSupplierItem,
  Order,
} from '@/lib/orders';

export type OrderDetailPatchPayload = {
  core?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  linked_invoice_id?: string | number | null;
  linked_quotation_id?: string | number | null;
  skip_kitchen_allocation?: boolean;
};

export type OrderDetailFormHelpers = {
  softInput: string;
  fVal: (key: string) => string;
  fInput: (key: string, type?: string, placeholder?: string) => ReactNode;
  labeled: (label: string, node: ReactNode, hint?: string) => ReactNode;
  readOnly: (label: string, value: ReactNode) => ReactNode;
  nonNeg: (value: string) => string;
  setFieldLocal: (key: string, value: unknown) => void;
  patch: (payload: OrderDetailPatchPayload, opts?: { revertStatusTo?: string }) => void;
  setOrder: Dispatch<SetStateAction<Order | null>>;
};

export type NestieeGiftBoxOption = {
  id: string;
  label: string;
  qtyKey: string;
};

export interface HonourOrderDetailProps {
  orderType: string;
  honourLines: HonourLineItem[];
  honourTotals: { totalQuantity: number; totalAmount: number };
  honourSuppliers: HonourSupplierItem[];
  supplierOptions: string[];
  setSupplierOptions: Dispatch<SetStateAction<string[]>>;
  commitHonourLines: (lines: HonourLineItem[]) => void;
  applyHonourSuppliers: (
    updater: (suppliers: HonourSupplierItem[]) => HonourSupplierItem[],
    commit: boolean,
  ) => void;
  form: OrderDetailFormHelpers;
}

export interface WeddingGiftOrderDetailProps {
  order: Order;
  weddingGiftTotal: number;
  birdNestTotals: { totalOrdered: number };
  bigDayPersistedRef: React.MutableRefObject<string>;
  bigDaySavedOnChangeRef: React.MutableRefObject<string | null>;
  onOpenConfirmPaste: () => void;
  syncWeddingGiftDerived: (fieldsPatch?: Record<string, string>) => void;
  syncWeddingGiftTotalAmount: (fieldsPatch?: Record<string, string>) => void;
  form: OrderDetailFormHelpers;
}

export interface NestieeOrderDetailProps {
  order: Order;
  nestieeGiftBoxes: NestieeGiftBoxOption[];
  form: OrderDetailFormHelpers;
}

export interface CupmokaOrderDetailProps {
  order: Order;
  commitCupmokaLines: (lines: CupmokaLineItem[]) => void;
  form: OrderDetailFormHelpers;
}

export interface OrderDetailTypePanelProps {
  orderType: string;
  order: Order;
  form: OrderDetailFormHelpers;
  honourLines: HonourLineItem[];
  honourTotals: { totalQuantity: number; totalAmount: number };
  honourSuppliers: HonourSupplierItem[];
  supplierOptions: string[];
  setSupplierOptions: Dispatch<SetStateAction<string[]>>;
  commitHonourLines: (lines: HonourLineItem[]) => void;
  applyHonourSuppliers: (
    updater: (suppliers: HonourSupplierItem[]) => HonourSupplierItem[],
    commit: boolean,
  ) => void;
  weddingGiftTotal: number;
  birdNestTotals: { totalOrdered: number };
  bigDayPersistedRef: React.MutableRefObject<string>;
  bigDaySavedOnChangeRef: React.MutableRefObject<string | null>;
  onOpenConfirmPaste: () => void;
  syncWeddingGiftDerived: (fieldsPatch?: Record<string, string>) => void;
  syncWeddingGiftTotalAmount: (fieldsPatch?: Record<string, string>) => void;
  nestieeGiftBoxes: NestieeGiftBoxOption[];
  commitCupmokaLines: (lines: CupmokaLineItem[]) => void;
}
