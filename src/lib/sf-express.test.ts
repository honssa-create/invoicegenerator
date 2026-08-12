import { describe, expect, it, vi } from 'vitest';
import {
  SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
  type SfExpressSettings,
} from './integration-settings';
import {
  buildSfExpressFormDefaults,
  validateSfExpressForm,
} from './sf-express-form';
import {
  cloudPrintWaybills,
  createSfOrder,
  extractCloudPrintPdfUrl,
  extractWaybillNo,
  sfMsgDigest,
} from './sf-express';
import type { Order } from './orders';

const baseCredentials: SfExpressSettings = {
  partner_id: 'TEST_PARTNER',
  checkword: 'checkword123',
  monthly_card: '7551234567',
  environment: 'sandbox',
  express_type_id: '1',
  pay_method: '1',
  print_template_code: SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
  sender_company: 'Honour',
  sender_contact: 'Ops',
  sender_tel: '21234567',
  sender_address: 'Hong Kong',
};

function sampleOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 42,
    user_id: 1,
    reference_number: 'REF-42',
    po_number: 'PO-1001',
    name: 'Alice Chan',
    description: 'Custom badges',
    status: 'OPEN',
    delivery_date: '',
    customer_email: '',
    phone: '91234567',
    shipping_address: 'Kwun Tong, Kowloon',
    notes: '',
    carton_count: '3 boxes',
    quotation_id: null,
    total_amount: null,
    fields: {
      receiving_time: '2-6pm',
      client_delivery_date: '2026-08-12',
    },
    files: [],
    activities: [],
    linked_invoice: null,
    linked_quotation: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('sfMsgDigest', () => {
  it('matches SF documented vector (URL-encode then MD5 then Base64)', () => {
    // From 丰桥 docs / community examples
    const msgData = '{"language":"zh-CN","orderId":"QIAO-20200618-004"}';
    const timestamp = '12312334453453';
    const checkword = 'fjcg5PGKaNpPSHFAZ4QsCOkV71R3zVci';
    expect(sfMsgDigest(msgData, timestamp, checkword)).toBe('IIKJtuLVzoFTu4kHI8M8vA==');
  });
});

describe('buildSfExpressFormDefaults', () => {
  it('prefills from order fields', () => {
    const form = buildSfExpressFormDefaults(sampleOrder(), {
      payMethod: '1',
      expressTypeId: '2',
    });
    expect(form.orderId).toBe('PO-1001');
    expect(form.recipientName).toBe('Alice Chan');
    expect(form.recipientPhone).toBe('91234567');
    expect(form.recipientAddress).toBe('Kwun Tong, Kowloon');
    expect(form.country).toBe('HK');
    expect(form.cargoName).toBe('Custom badges');
    expect(form.parcelQty).toBe('3');
    expect(form.weightKg).toBe('1');
    expect(form.expressTypeId).toBe('2');
    expect(form.remark).toContain('2026-08-12');
    expect(form.remark).toContain('2-6pm');
  });

  it('falls back to ORD-{id} when no po/reference', () => {
    const form = buildSfExpressFormDefaults(
      sampleOrder({ po_number: '', reference_number: '' })
    );
    expect(form.orderId).toBe('ORD-42');
  });
});

describe('validateSfExpressForm', () => {
  it('requires recipient phone and address', () => {
    const form = buildSfExpressFormDefaults(sampleOrder({ phone: '', shipping_address: '' }));
    expect(validateSfExpressForm(form)).toMatch(/phone/i);
    form.recipientPhone = '91234567';
    expect(validateSfExpressForm(form)).toMatch(/address/i);
  });
});

describe('extractWaybillNo / extractCloudPrintPdfUrl', () => {
  it('parses waybill from apiResultData string', () => {
    const body = {
      apiResultCode: 'A1000',
      apiResultData: JSON.stringify({
        success: true,
        msgData: {
          orderId: 'PO-1',
          waybillNoInfoList: [{ waybillNo: 'SF5120793357800' }],
        },
      }),
    };
    expect(extractWaybillNo(body)).toBe('SF5120793357800');
  });

  it('normalizes cloud print url and base64', () => {
    expect(
      extractCloudPrintPdfUrl({
        apiResultData: JSON.stringify({
          obj: { files: [{ url: 'https://example.com/label.pdf' }] },
        }),
      })
    ).toBe('https://example.com/label.pdf');

    expect(
      extractCloudPrintPdfUrl({
        apiResultData: JSON.stringify({
          obj: { files: [{ token: 'AAAAbase64' }] },
        }),
      })
    ).toBe('data:application/pdf;base64,AAAAbase64');
  });
});

describe('createSfOrder / cloudPrintWaybills', () => {
  it('createSfOrder returns waybill from mocked SF response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          apiResultCode: 'A1000',
          apiResultData: JSON.stringify({
            success: true,
            msgData: {
              orderId: 'PO-1001',
              waybillNoInfoList: [{ waybillNo: 'SF999' }],
            },
          }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await createSfOrder(
      baseCredentials,
      {
        orderId: 'PO-1001',
        monthlyCard: '7551234567',
        payMethod: 1,
        expressTypeId: 1,
        parcelQty: 1,
        cargoDetails: [{ name: 'Goods' }],
        contactInfoList: [
          {
            contactType: 1,
            company: 'Honour',
            contact: 'Ops',
            tel: '21234567',
            country: 'HK',
            address: 'HK',
          },
          {
            contactType: 2,
            contact: 'Alice',
            mobile: '91234567',
            country: 'HK',
            address: 'KT',
          },
        ],
      },
      fetchImpl as unknown as typeof fetch
    );

    expect(result.waybillNo).toBe('SF999');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('EXP_RECE_CREATE_ORDER');
  });

  it('cloudPrintWaybills uses default HK local template', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          apiResultCode: 'A1000',
          apiResultData: JSON.stringify({
            success: true,
            obj: { files: [{ url: 'https://cdn.example/label.pdf' }] },
          }),
        }),
        { status: 200 }
      )
    );

    const result = await cloudPrintWaybills(
      { ...baseCredentials, print_template_code: '' },
      'SF999',
      fetchImpl as unknown as typeof fetch
    );
    expect(result.pdfUrl).toBe('https://cdn.example/label.pdf');
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(decodeURIComponent(body)).toContain(SF_EXPRESS_DEFAULT_PRINT_TEMPLATE);
  });
});
