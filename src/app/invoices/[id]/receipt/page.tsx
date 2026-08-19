'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FormalQuotationDocument from '@/components/FormalQuotationDocument';
import { invoiceToReceiptPreview } from '@/lib/invoice-print';
import {
  DEFAULT_QUOTATION_STYLE,
  loadQuotationStyleFromStorage,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';
import type { InvoiceWithDetails } from '@/lib/types';
import { BTN, bi } from '@/lib/ui-labels';

interface Business {
  name: string;
  company_name: string | null;
  email: string;
}

type PdfChopMode = 'chop' | 'no-chop';

const PDF_CHOP_STORAGE_KEY = 'invoice-pdf-chop';

const PDF_CHOP_OPTIONS: { id: PdfChopMode; label: string }[] = [
  { id: 'chop', label: bi('Chop', '公司章') },
  { id: 'no-chop', label: bi('No chop', '無公司章') },
];

function loadPdfChop(): PdfChopMode {
  if (typeof window === 'undefined') return 'chop';
  try {
    const raw = localStorage.getItem(PDF_CHOP_STORAGE_KEY);
    if (raw === 'chop' || raw === 'no-chop') return raw;
  } catch {
    /* ignore */
  }
  return 'chop';
}

export default function InvoiceReceiptPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [style, setStyle] = useState<QuotationStyleTemplate>(DEFAULT_QUOTATION_STYLE);
  const [chopMode, setChopMode] = useState<PdfChopMode>('chop');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setInvoice(d.invoice || null);
        setBusiness(d.business || null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [id]);

  useEffect(() => {
    setStyle(loadQuotationStyleFromStorage('label') || DEFAULT_QUOTATION_STYLE);
    setChopMode(loadPdfChop());
  }, []);

  const setChopPersist = (mode: PdfChopMode) => {
    setChopMode(mode);
    try {
      localStorage.setItem(PDF_CHOP_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const isPaid = invoice?.status === 'paid';

  useEffect(() => {
    if (!invoice || !isPaid) return;
    const key = `invoice-receipt-logged-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice', id, body: '🧾 Generated receipt PDF / print view' }),
    }).catch(() => {});
  }, [invoice, id, isPaid]);

  const model = useMemo(
    () => (invoice && isPaid ? invoiceToReceiptPreview(invoice, business) : null),
    [invoice, business, isPaid],
  );

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!invoice || !isPaid) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-gray-700 text-sm">
            {bi(
              'A receipt can only be generated for paid invoices.',
              '只有已付款的發票可以產生收據。',
            )}
          </p>
          <Link
            href={`/invoices/${id}`}
            className="inline-block mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            ← {bi('Back to invoice', '返回發票')}
          </Link>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/invoices/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          ← {bi('Back to invoice', '返回發票')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
            role="group"
            aria-label={bi('PDF chop', 'PDF 公司章')}
          >
            {PDF_CHOP_OPTIONS.map((opt) => {
              const active = chopMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChopPersist(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    active
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            {BTN.printPdf}
          </button>
        </div>
      </div>

      <div className="py-8 print:py-0">
        <FormalQuotationDocument
          model={model}
          style={style}
          printMode
          showSum
          showSignature
          showChop={chopMode === 'chop'}
          documentTitle="RECEIPT"
          numberLabel="Invoice No."
          remarksMode="plain"
        />
      </div>
    </div>
  );
}
