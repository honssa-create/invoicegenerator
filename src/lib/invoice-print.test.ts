import { describe, expect, it } from 'vitest';
import {
  computeBalanceDueAmount,
  defaultDepositAmount,
  defaultReceiptPaymentRemarks,
  invoiceToDepositPreview,
  invoiceToFormalPreview,
  invoiceToReceiptPreview,
  resolveInvoiceDepositAmount,
} from './invoice-print';
import type { InvoiceWithDetails } from './types';

function minimalInvoice(overrides: Partial<InvoiceWithDetails> = {}): InvoiceWithDetails {
  return {
    id: 1,
    user_id: 1,
    customer_id: null,
    invoice_number: 'INV-001',
    external_invoice_number: null,
    email: null,
    send_later: 0,
    issue_date: '2026-01-15',
    due_date: '2026-02-15',
    term: 'NET30',
    tax_rate: 0,
    status: 'paid',
    notes: null,
    terms: null,
    billing_address: 'Billing Addr',
    shipping_address: 'Ship Addr',
    ship_via: null,
    shipping_date: null,
    tracking_no: null,
    order_no: 'PO-1',
    receipt_date: null,
    currency: 'HKD',
    discount_type: 'percent',
    discount_value: 0,
    shipping_amount: 0,
    deposit_amount: null,
    quotation_id: null,
    order_id: null,
    last_reminder_at: null,
    created_at: '',
    updated_at: '',
    customer_name: 'Acme',
    customer_email: null,
    customer_address: null,
    items: [
      {
        id: 1,
        invoice_id: 1,
        product_service: 'Widget',
        description: '',
        quantity: 1,
        unit_price: 100,
        amount: 100,
        sort_order: 0,
      },
    ],
    files: [],
    subtotal: 100,
    discount_amount: 0,
    tax_amount: 0,
    total: 100,
    ...overrides,
  } as InvoiceWithDetails;
}

describe('resolveInvoiceDepositAmount', () => {
  it('defaults to half total when deposit is unset', () => {
    expect(resolveInvoiceDepositAmount(1000, null)).toBe(500);
    expect(resolveInvoiceDepositAmount(1000, undefined)).toBe(500);
    expect(defaultDepositAmount(1000)).toBe(500);
  });

  it('uses stored deposit when set', () => {
    expect(resolveInvoiceDepositAmount(1000, 300)).toBe(300);
  });
});

describe('invoiceToFormalPreview', () => {
  it('uses invoice term field for payment terms', () => {
    const inv = minimalInvoice({ term: 'NET30', terms: 'Long terms and conditions text' });
    const model = invoiceToFormalPreview(inv);
    expect(model.paymentTerms).toBe('NET30');
  });
});

describe('invoiceToDepositPreview', () => {
  it('uses stored deposit_amount for deposit due', () => {
    const inv = minimalInvoice({ total: 1000, deposit_amount: 250 });
    const model = invoiceToDepositPreview(inv);
    expect(model.depositDue).toContain('250');
  });

  it('defaults deposit due to half total when deposit_amount is null', () => {
    const inv = minimalInvoice({ total: 1000, deposit_amount: null });
    const model = invoiceToDepositPreview(inv);
    expect(model.depositDue).toContain('500');
  });

  it('uses invoice term field for payment terms', () => {
    const inv = minimalInvoice({ term: 'NET30', terms: 'Long terms and conditions text' });
    const model = invoiceToDepositPreview(inv);
    expect(model.paymentTerms).toBe('NET30');
  });
});

describe('computeBalanceDueAmount', () => {
  it('defaults to half total when not linked to an order', () => {
    expect(computeBalanceDueAmount(1000)).toBe(500);
    expect(computeBalanceDueAmount(1000, null)).toBe(500);
  });

  it('uses remaining unpaid when order payment fields are present', () => {
    expect(
      computeBalanceDueAmount(1000, {
        payment_amount: '400',
        payment2_amount: '100',
      }),
    ).toBe(500);
    expect(
      computeBalanceDueAmount(1000, {
        payment_amount: '1000',
      }),
    ).toBe(0);
    expect(
      computeBalanceDueAmount(1000, {
        payment_amount: '1200',
      }),
    ).toBe(0);
  });
});

describe('invoiceToReceiptPreview', () => {
  it('uses thank-you remarks and today as the receipt date', () => {
    const inv = minimalInvoice({ issue_date: '2020-01-01' });
    const invoiceModel = invoiceToFormalPreview(inv);
    const receiptModel = invoiceToReceiptPreview(inv);

    expect(defaultReceiptPaymentRemarks()).toBe('Thank you for your payment.');
    expect(receiptModel.remarks).toEqual(['Thank you for your payment.']);
    expect(invoiceModel.remarks[0]).toContain('Bank transfer detail');
    expect(receiptModel.quotationNo).toBe(invoiceModel.quotationNo);
    expect(receiptModel.total).toBe(invoiceModel.total);
    expect(receiptModel.date).not.toBe(invoiceModel.date);

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const [y, m, d] = todayIso.split('-');
    expect(receiptModel.date).toBe(`${d}/${m}/${y}`);
  });
});
