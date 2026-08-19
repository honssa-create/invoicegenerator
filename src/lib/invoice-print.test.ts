import { describe, expect, it } from 'vitest';
import {
  computeBalanceDueAmount,
  defaultReceiptPaymentRemarks,
  invoiceToFormalPreview,
  invoiceToReceiptPreview,
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
    order_id: null,
    last_reminder_at: null,
    created_at: '',
    updated_at: '',
    customer_name: 'Acme',
    customer_email: null,
    customer_address: null,
    customer_city: null,
    customer_state: null,
    customer_zip: null,
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
  it('uses thank-you remarks instead of payment instructions', () => {
    const inv = minimalInvoice();
    const invoiceModel = invoiceToFormalPreview(inv);
    const receiptModel = invoiceToReceiptPreview(inv);

    expect(defaultReceiptPaymentRemarks()).toBe('Thank you for your payment.');
    expect(receiptModel.remarks).toEqual(['Thank you for your payment.']);
    expect(invoiceModel.remarks[0]).toContain('Bank transfer detail');
    expect(receiptModel.quotationNo).toBe(invoiceModel.quotationNo);
    expect(receiptModel.total).toBe(invoiceModel.total);
  });
});
