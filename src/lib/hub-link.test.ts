import { describe, expect, it } from 'vitest';
import { extractSystemOrderRef, pickBestHubOrderMatch, scoreHubOrderMatch } from './hub-link';

describe('extractSystemOrderRef', () => {
  it('extracts prefixed order numbers from text', () => {
    expect(extractSystemOrderRef('Invoice for NES-1042')).toBe('NES-1042');
    expect(extractSystemOrderRef('nes-99')).toBe('NES-99');
  });
});

describe('scoreHubOrderMatch', () => {
  const candidate = {
    id: 1,
    po_number: '1042',
    system_order_no: 'NES-1042',
    customer_name: 'Jane Doe',
    total_amount: 1280,
    created_at: '2026-04-15 10:00:00',
  };

  it('scores exact doc number matches highest', () => {
    expect(
      scoreHubOrderMatch(candidate, {
        docNumber: 'NES-1042',
        customerName: 'Jane Doe',
        totalAmount: 1280,
        txnDate: '2026-04-15',
      })
    ).toBeGreaterThanOrEqual(100);
  });

  it('matches woo order number to po_number', () => {
    expect(
      scoreHubOrderMatch(candidate, {
        docNumber: '1042',
        totalAmount: 1280,
      })
    ).toBeGreaterThanOrEqual(100);
  });
});

describe('pickBestHubOrderMatch', () => {
  it('picks the strongest candidate above threshold', () => {
    const picked = pickBestHubOrderMatch(
      [
        {
          id: 1,
          po_number: '2001',
          system_order_no: 'NES-2001',
          customer_name: 'A',
          total_amount: 500,
          created_at: '2026-01-01',
        },
        {
          id: 2,
          po_number: '1042',
          system_order_no: 'NES-1042',
          customer_name: 'Jane Doe',
          total_amount: 1280,
          created_at: '2026-04-15',
        },
      ],
      { docNumber: '1042', totalAmount: 1280, customerName: 'Jane Doe' }
    );
    expect(picked?.id).toBe(2);
  });
});
