import { describe, expect, it } from 'vitest';
import { orderToDeliveryNotePreview } from './delivery-note-print';
import type { Order } from './orders';

function minimalOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    user_id: 1,
    po_number: 'PO-100',
    name: 'Jane',
    description: 'Custom badges',
    status: 'OPEN',
    delivery_date: '',
    customer_email: '',
    phone: '',
    shipping_address: 'Ship Addr',
    notes: '',
    carton_count: '2',
    quotation_id: null,
    fields: {
      order_type: 'honour訂製',
      client_delivery_date: '2026-07-24',
      tracking_no: 'SF123',
    },
    linked_invoice: null,
    ...overrides,
  } as Order;
}

describe('orderToDeliveryNotePreview', () => {
  it('uses honour line description instead of delivery metadata under item name', () => {
    const model = orderToDeliveryNotePreview(
      minimalOrder({
        fields: {
          order_type: 'honour訂製',
          client_delivery_date: '2026-07-24',
          honour_lines: JSON.stringify([
            {
              style: '金屬襟章',
              quantity: '100',
              unit_price: '5',
              description: 'Custom note\nLine 2',
            },
          ]),
        },
      }),
    );

    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({
      name: '金屬襟章',
      description: 'Custom note\nLine 2',
      qty: '100',
    });
    expect(model.items[0].description).not.toContain('Delivery:');
  });

  it('maps multiple product lines and skips shipping rows', () => {
    const model = orderToDeliveryNotePreview(
      minimalOrder({
        fields: {
          order_type: 'honour en訂製',
          honour_lines: JSON.stringify([
            { style: 'Acrylic A', quantity: '50', unit_price: '8', description: 'Finish A' },
            { style: 'Shipping', quantity: '1', unit_price: '35' },
            { style: 'Acrylic B', quantity: '20', unit_price: '12.5', description: 'Finish B' },
          ]),
        },
      }),
    );

    expect(model.items).toHaveLength(2);
    expect(model.items[0]).toMatchObject({ name: 'Acrylic A', description: 'Finish A', qty: '50' });
    expect(model.items[1]).toMatchObject({ name: 'Acrylic B', description: 'Finish B', qty: '20' });
  });
});
