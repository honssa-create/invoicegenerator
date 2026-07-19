'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui';
import type { InvoiceWithDetails } from '@/lib/types';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

interface Business {
  name: string;
  company_name: string | null;
  email: string;
}

export default function InvoicePrintPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoice(data.invoice);
        setBusiness(data.business);
      });
  }, [id]);

  if (!invoice || !business) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/invoices/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          ← {bi('Back to invoice', '返回發票')}
        </Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
        >
          {BTN.printPdf}
        </button>
      </div>

      <div className="max-w-4xl mx-auto my-8 bg-white shadow-lg rounded-lg overflow-hidden print:shadow-none print:my-0 print:rounded-none">
        <div className="p-12">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{TITLE.invoiceDoc}</h1>
              <p className="text-lg text-brand-600 font-semibold mt-1">{invoice.invoice_number}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg text-gray-900">{business.company_name || business.name}</p>
              <p className="text-sm text-gray-600">{business.email}</p>
              <div className="mt-2"><StatusBadge status={invoice.status} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 mb-12">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">{bi('Bill To', '帳單對象')}</p>
              <p className="font-semibold text-gray-900 text-lg">{invoice.customer_name}</p>
              {invoice.customer_email && <p className="text-sm text-gray-600">{invoice.customer_email}</p>}
              {invoice.customer_address && <p className="text-sm text-gray-600 mt-1">{invoice.customer_address}</p>}
              {(invoice.customer_city || invoice.customer_state) && (
                <p className="text-sm text-gray-600">
                  {[invoice.customer_city, invoice.customer_state, invoice.customer_zip].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="inline-block text-left space-y-2">
                <div className="flex justify-between gap-8">
                  <span className="text-sm text-gray-500">{bi('Issue Date', '開立日期')}:</span>
                  <span className="text-sm font-medium">{formatDate(invoice.issue_date)}</span>
                </div>
                <div className="flex justify-between gap-8">
                  <span className="text-sm text-gray-500">{bi('Due Date', '到期日')}:</span>
                  <span className="text-sm font-medium">{formatDate(invoice.due_date)}</span>
                </div>
              </div>
            </div>
          </div>

          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-3 text-sm font-semibold uppercase tracking-wider">{bi('Description', '描述')}</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">{bi('Qty', '數量')}</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">{bi('Rate', '單價')}</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">{bi('Amount', '金額')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-4 text-sm">{item.description}</td>
                  <td className="py-4 text-sm text-right">{item.quantity}</td>
                  <td className="py-4 text-sm text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="py-4 text-sm text-right font-medium">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-12">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{bi('Subtotal', '小計')}</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.tax_rate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{bi('Tax', '稅項')} ({invoice.tax_rate}%)</span>
                  <span>{formatCurrency(invoice.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold border-t-2 border-gray-900 pt-2">
                <span>{bi('Total Due', '應付總額')}</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          {(invoice.notes || invoice.terms) && (
            <div className="border-t border-gray-200 pt-8 grid md:grid-cols-2 gap-8">
              {invoice.notes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">{bi('Notes', '備註')}</p>
                  <p className="text-sm text-gray-600">{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold mb-2">{bi('Terms & Conditions', '條款及細則')}</p>
                  <p className="text-sm text-gray-600">{invoice.terms}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
