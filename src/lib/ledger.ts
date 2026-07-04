import db from './db';
import type {
  LedgerEntry,
  LedgerSource,
  OrderSource,
  OtherIncomeWithDetails,
} from './types';
import { getTeamUserIds } from './team';

const CATEGORY_ICONS: Record<string, string> = {
  rent: '🏢',
  interest: '💰',
  refund: '↩️',
  other: '📋',
};

export function getOrderDisplayNumber(
  invoiceId: number,
  invoiceNumber: string,
  externalOrderId: string | null
): string {
  if (externalOrderId) return externalOrderId;
  const match = invoiceNumber.match(/(\d+)$/);
  return match ? match[1] : String(invoiceId);
}

export function getOrderSourceIcon(orderSource: OrderSource): string {
  switch (orderSource) {
    case 'wedding':
      return '💒';
    case 'woocommerce':
      return '📦';
    default:
      return '📦';
  }
}

export function buildOrderSource(
  invoiceId: number,
  invoiceNumber: string,
  customerName: string,
  orderSource: OrderSource,
  externalOrderId: string | null
): LedgerSource {
  const orderNumber = getOrderDisplayNumber(invoiceId, invoiceNumber, externalOrderId);
  const icon = getOrderSourceIcon(orderSource);
  return {
    type: 'order',
    icon,
    label: `Order #${orderNumber} (${customerName})`,
    href: `/invoices/${invoiceId}`,
    invoiceId,
    customerName,
    orderNumber,
  };
}

export function buildOtherIncomeSource(category: string, remarks: string | null): LedgerSource {
  const key = category.toLowerCase().replace(/\s+income$/, '');
  const icon = CATEGORY_ICONS[key] || '📋';
  const displayCategory = category.toLowerCase().endsWith('income')
    ? category
    : `${category} Income`;
  const label = remarks ? `${displayCategory} — ${remarks}` : displayCategory;
  return {
    type: 'other_income',
    icon,
    label,
    category: displayCategory,
  };
}

export function buildUnlinkedSource(): LedgerSource {
  return {
    type: 'unlinked',
    icon: '🔴',
    label: 'Unlinked / 待認領',
  };
}

export function getOtherIncomes(userId: number): OtherIncomeWithDetails[] {
  const teamIds = getTeamUserIds(userId);
  const placeholders = teamIds.map(() => '?').join(', ');

  return db
    .prepare(
      `SELECT o.*, u.name as created_by_name
       FROM other_incomes o
       JOIN users u ON u.id = o.created_by
       WHERE o.user_id IN (${placeholders})
       ORDER BY o.income_date DESC, o.created_at DESC`
    )
    .all(...teamIds) as OtherIncomeWithDetails[];
}

export function buildFinancialLedger(userId: number): LedgerEntry[] {
  const teamIds = getTeamUserIds(userId);
  const placeholders = teamIds.map(() => '?').join(', ');
  const entries: LedgerEntry[] = [];

  const payments = db
    .prepare(
      `SELECT p.id, p.invoice_id, p.amount, p.payment_date, p.receipt_note, p.status,
              i.invoice_number, i.order_source, i.external_order_id, c.name as customer_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN customers c ON c.id = i.customer_id
       WHERE p.user_id IN (${placeholders})
       ORDER BY p.payment_date DESC, p.created_at DESC`
    )
    .all(...teamIds) as {
    id: number;
    invoice_id: number;
    amount: number;
    payment_date: string;
    receipt_note: string | null;
    status: 'pending_verification' | 'bank_cleared';
    invoice_number: string;
    order_source: OrderSource;
    external_order_id: string | null;
    customer_name: string;
  }[];

  for (const p of payments) {
    entries.push({
      id: `payment-${p.id}`,
      entryType: 'product_sale',
      date: p.payment_date,
      amount: p.amount,
      description: p.receipt_note || p.invoice_number,
      status: p.status,
      source: buildOrderSource(
        p.invoice_id,
        p.invoice_number,
        p.customer_name,
        p.order_source || 'manual',
        p.external_order_id
      ),
      paymentId: p.id,
      invoiceId: p.invoice_id,
    });
  }

  const otherIncomes = getOtherIncomes(userId);
  for (const o of otherIncomes) {
    entries.push({
      id: `other-${o.id}`,
      entryType: 'other_income',
      date: o.income_date,
      amount: o.amount,
      description: o.remarks || o.category,
      status: 'recorded',
      source: buildOtherIncomeSource(o.category, o.remarks),
      otherIncomeId: o.id,
    });
  }

  const unclaimed = db
    .prepare(
      `SELECT d.id, d.deposit_date, d.amount, d.bank, d.remarks,
              d.claimed_invoice_id, i.invoice_number, i.order_source, i.external_order_id,
              c.name as customer_name
       FROM unclaimed_deposits d
       LEFT JOIN invoices i ON i.id = d.claimed_invoice_id
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE d.user_id IN (${placeholders}) AND d.status = 'unclaimed'
       ORDER BY d.deposit_date DESC, d.created_at DESC`
    )
    .all(...teamIds) as {
    id: number;
    deposit_date: string;
    amount: number;
    bank: string;
    remarks: string | null;
    claimed_invoice_id: number | null;
    invoice_number: string | null;
    order_source: OrderSource | null;
    external_order_id: string | null;
    customer_name: string | null;
  }[];

  for (const d of unclaimed) {
    entries.push({
      id: `unclaimed-${d.id}`,
      entryType: 'unclaimed_deposit',
      date: d.deposit_date,
      amount: d.amount,
      description: d.remarks || d.bank,
      status: 'unclaimed',
      source: buildUnlinkedSource(),
      depositId: d.id,
    });
  }

  entries.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.id.localeCompare(a.id);
  });

  return entries;
}
