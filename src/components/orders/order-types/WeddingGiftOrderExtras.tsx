'use client';

import CustomerSelect from '@/components/CustomerSelect';
import EntityAttachments from '@/components/EntityAttachments';
import type { InvoiceOption, QuotationOption } from '@/hooks/orders/useOrderDetail';
import { orderFileUrl } from '@/lib/image-url';
import { ORDER_SHIPPING_METHODS, ORDER_TYPES, type Order } from '@/lib/orders';
import { displayInvoiceNumber, displayQuotationNumber } from '@/lib/record-numbering-core';
import type { Customer } from '@/lib/types';
import { bi } from '@/lib/ui-labels';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { OrderDetailFormHelpers } from '../order-detail-types';

type Props = {
  order: Order;
  orderType: string;
  invoices: InvoiceOption[];
  quotations: QuotationOption[];
  form: OrderDetailFormHelpers;
  setCoreLocal: (col: string, value: unknown) => void;
  applyCustomerFromList: (customer: Customer) => void;
  syncWeddingGiftTotalAmount: (fieldsPatch?: Record<string, string>) => void;
  weddingGiftTotal: number;
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[13px] font-semibold text-[#5c6370]">{title}</h3>
      {children}
    </section>
  );
}

export default function WeddingGiftOrderExtras({
  order,
  orderType,
  invoices,
  quotations,
  form,
  setCoreLocal,
  applyCustomerFromList,
  syncWeddingGiftTotalAmount,
  weddingGiftTotal,
}: Props) {
  const { softInput, fVal, labeled, readOnly, setFieldLocal, patch, setOrder } = form;

  return (
    <div className="mt-10 max-w-[920px] space-y-8 border-t border-[#eceef1] pt-8">
      <Block title={bi('Order', '訂單')}>
        <div className="grid md:grid-cols-2 gap-4">
          {labeled(
            'Order Type 訂單種類',
            <select
              value={orderType}
              onChange={(e) => {
                setFieldLocal('order_type', e.target.value);
                patch({ fields: { order_type: e.target.value } });
              }}
              className={softInput}
            >
              <option value="">Select type…</option>
              {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>,
          )}
          {labeled(
            bi('Description', '描述'),
            <input
              value={order.description}
              onChange={(e) => setCoreLocal('description', e.target.value)}
              onBlur={(e) => patch({ core: { description: e.target.value } })}
              placeholder="e.g. 20261128 70樽"
              className={softInput}
            />,
          )}
          {labeled(
            '單樽價格',
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                value={fVal('unit_bottle_price')}
                onChange={(e) => setFieldLocal('unit_bottle_price', e.target.value)}
                onBlur={(e) => syncWeddingGiftTotalAmount({ unit_bottle_price: e.target.value })}
                placeholder="0.00"
                className={`${softInput} pl-7`}
              />
            </div>,
          )}
          {readOnly(
            '總金額',
            `$${weddingGiftTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          )}
        </div>
      </Block>

      <Block title="Linked Records 關聯文件">
        <div className="grid md:grid-cols-2 gap-5">
          {labeled(
            'Quotation 報價單',
            <div className="space-y-2">
              {order.linked_quotation ? (
                <Link href={`/quotations/${order.linked_quotation.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                  🔗 {displayQuotationNumber(order.linked_quotation.quote_number)} · {order.linked_quotation.status}
                </Link>
              ) : (
                <p className="text-sm text-gray-400">No quotation linked.</p>
              )}
              <select
                value={order.quotation_id || ''}
                onChange={(e) => patch({ linked_quotation_id: e.target.value || null })}
                className={softInput}
              >
                <option value="">— Not linked —</option>
                {quotations.map((q) => <option key={q.id} value={q.id}>{displayQuotationNumber(q.quote_number)} · {q.status}</option>)}
              </select>
            </div>,
          )}
          {labeled(
            'Invoice 發票',
            <div className="space-y-2">
              {order.linked_invoice ? (
                <Link href={`/invoices/${order.linked_invoice.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                  🔗 {displayInvoiceNumber(order.linked_invoice.invoice_number)} · {order.linked_invoice.status}
                </Link>
              ) : (
                <p className="text-sm text-gray-400">No invoice linked.</p>
              )}
              <select
                value={order.linked_invoice?.id || ''}
                onChange={(e) => patch({ linked_invoice_id: e.target.value || null })}
                className={softInput}
              >
                <option value="">— Not linked —</option>
                {invoices.map((inv) => <option key={inv.id} value={inv.id}>{displayInvoiceNumber(inv.invoice_number)} · {inv.status}</option>)}
              </select>
            </div>,
          )}
        </div>
      </Block>

      <Block title="Client 客戶">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-900 mb-1">Name 客戶</label>
            <CustomerSelect
              value={order.name}
              orderType={fVal('order_type')}
              requireOrderType
              onSelect={applyCustomerFromList}
              placeholder={bi('Select or add customer…', '選擇或新增客戶…')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-900 mb-1">公司名</label>
            <input
              value={fVal('company_name')}
              onChange={(e) => setFieldLocal('company_name', e.target.value)}
              onBlur={(e) => patch({ fields: { company_name: e.target.value } })}
              className={softInput}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-900 mb-1">電話 Phone</label>
            <input
              value={order.phone}
              onChange={(e) => setCoreLocal('phone', e.target.value)}
              onBlur={(e) => patch({ core: { phone: e.target.value } })}
              placeholder="+852…"
              className={softInput}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-900 mb-1">E-mail</label>
            <input
              value={order.customer_email}
              onChange={(e) => setCoreLocal('customer_email', e.target.value)}
              onBlur={(e) => patch({ core: { customer_email: e.target.value } })}
              placeholder="name@email.com"
              className={softInput}
            />
          </div>
        </div>
      </Block>

      <Block title="Shipment 送貨">
        <div className="grid md:grid-cols-2 gap-4">
          {labeled('Tracking Number 運單號', (
            <input
              value={fVal('tracking_no')}
              onChange={(e) => setFieldLocal('tracking_no', e.target.value)}
              onBlur={(e) => patch({ fields: { tracking_no: e.target.value } })}
              placeholder="e.g. SF5120793357800"
              className={softInput}
            />
          ))}
          {labeled(
            'Shipping Method 寄出方式',
            <select
              value={fVal('shipping_method')}
              onChange={(e) => {
                setFieldLocal('shipping_method', e.target.value);
                patch({ fields: { shipping_method: e.target.value } });
              }}
              className={softInput}
            >
              <option value="">—</option>
              {ORDER_SHIPPING_METHODS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>,
          )}
          <div className="md:col-span-2">
            {labeled(
              '帳單地址 Billing Address',
              <textarea
                value={String(order.fields.billing_address ?? '')}
                onChange={(e) => setFieldLocal('billing_address', e.target.value)}
                onBlur={(e) => patch({ fields: { billing_address: e.target.value } })}
                rows={3}
                className={softInput}
              />,
            )}
          </div>
        </div>
      </Block>

      <Block title="Notes 備註">
        <textarea
          value={order.notes}
          onChange={(e) => setCoreLocal('notes', e.target.value)}
          onBlur={(e) => patch({ core: { notes: e.target.value } })}
          rows={3}
          placeholder="Add notes… (manually input or edited)"
          className={softInput}
        />
      </Block>

      <div id="order-attachments">
        <EntityAttachments
          title="Design Proofs 設計圖 / Image Preview"
          files={order.files}
          fileUrl={orderFileUrl}
          uploadUrl={`/api/orders/${order.id}/files`}
          fileApiBase="/api/order-files"
          thumbnailFileId={order.fields.thumbnail_file_id}
          onFilesChange={(files) => setOrder((o) => (o ? { ...o, files } : o))}
          onSetThumbnail={(fileId) => {
            setOrder((o) =>
              o
                ? {
                    ...o,
                    fields: {
                      ...o.fields,
                      thumbnail_file_id: fileId ? String(fileId) : '',
                    },
                  }
                : o
            );
            patch({ fields: { thumbnail_file_id: fileId ? String(fileId) : '' } });
          }}
        />
      </div>
    </div>
  );
}
