'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { QUOTATION_STATUS_COLORS, type QuotationWithDetails } from '@/lib/quotations';

interface Business { name: string; company_name: string | null; email: string; }

export default function QuotationPrintPage() {
  const { id } = useParams();
  const [quote, setQuote] = useState<QuotationWithDetails | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    fetch(`/api/quotations/${id}`).then((r) => r.json()).then((d) => { setQuote(d.quotation); setBusiness(d.business); });
  }, [id]);

  // Log the PDF generation once per session to the activity feed.
  useEffect(() => {
    if (!quote) return;
    const key = `quote-pdf-logged-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'quotation', id, body: '🧾 Generated quotation PDF / print view' }),
    }).catch(() => {});
  }, [quote, id]);

  if (!quote || !business) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/quotations/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">← Back to quotation</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">Print / Save as PDF</button>
      </div>

      <div className="max-w-4xl mx-auto my-8 bg-white shadow-lg rounded-lg overflow-hidden print:shadow-none print:my-0 print:rounded-none">
        <div className="p-12">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">QUOTATION</h1>
              <p className="text-lg text-brand-600 font-semibold mt-1">{quote.quote_number}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg text-gray-900">{business.company_name || business.name}</p>
              <p className="text-sm text-gray-600">{business.email}</p>
              <span className={`inline-flex mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${QUOTATION_STATUS_COLORS[quote.status]}`}>{quote.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 mb-12">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">Quote For</p>
              <p className="font-semibold text-gray-900 text-lg">{quote.customer_name || '—'}</p>
              {quote.customer_email && <p className="text-sm text-gray-600">{quote.customer_email}</p>}
              {quote.customer_address && <p className="text-sm text-gray-600 mt-1">{quote.customer_address}</p>}
            </div>
            <div className="text-right">
              <div className="inline-block text-left space-y-2">
                <div className="flex justify-between gap-8"><span className="text-sm text-gray-500">Issue Date:</span><span className="text-sm font-medium">{formatDate(quote.issue_date)}</span></div>
                {quote.valid_until && <div className="flex justify-between gap-8"><span className="text-sm text-gray-500">Valid Until:</span><span className="text-sm font-medium">{formatDate(quote.valid_until)}</span></div>}
              </div>
            </div>
          </div>

          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-3 text-sm font-semibold uppercase tracking-wider">Description</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">Qty</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">Rate</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
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
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
              {quote.tax_rate > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Tax ({quote.tax_rate}%)</span><span>{formatCurrency(quote.tax_amount)}</span></div>}
              <div className="flex justify-between text-xl font-bold border-t-2 border-gray-900 pt-2"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
            </div>
          </div>

          {(quote.notes || quote.terms) && (
            <div className="border-t border-gray-200 pt-8 grid md:grid-cols-2 gap-8">
              {quote.notes && <div><p className="text-xs text-gray-500 uppercase font-semibold mb-2">Notes</p><p className="text-sm text-gray-600">{quote.notes}</p></div>}
              {quote.terms && <div><p className="text-xs text-gray-500 uppercase font-semibold mb-2">Terms &amp; Conditions</p><p className="text-sm text-gray-600">{quote.terms}</p></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
