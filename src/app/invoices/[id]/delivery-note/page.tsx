'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DeliveryNoteDocument from '@/components/DeliveryNoteDocument';
import PrintDownloadActions from '@/components/PrintDownloadActions';
import { invoiceToDeliveryNotePreview } from '@/lib/delivery-note-print';
import { displayInvoiceNumber } from '@/lib/record-numbering-core';
import {
  DEFAULT_QUOTATION_STYLE,
  loadQuotationStyleFromStorage,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';
import type { InvoiceWithDetails } from '@/lib/types';
import { bi } from '@/lib/ui-labels';

type PdfChopMode = 'chop' | 'no-chop';

const PDF_CHOP_STORAGE_KEY = 'delivery-note-pdf-chop';

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

export default function InvoiceDeliveryNotePage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [style, setStyle] = useState<QuotationStyleTemplate>(DEFAULT_QUOTATION_STYLE);
  const [chopMode, setChopMode] = useState<PdfChopMode>('chop');

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInvoice(d?.invoice || null));
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

  useEffect(() => {
    if (!invoice) return;
    const key = `invoice-dn-logged-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice', id, body: '🚚 Generated delivery note (出貨單)' }),
    }).catch(() => {});
  }, [invoice, id]);

  const model = useMemo(
    () => (invoice ? invoiceToDeliveryNotePreview(invoice) : null),
    [invoice],
  );
  const showChop = chopMode === 'chop';

  if (!invoice || !model) {
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
          <PrintDownloadActions
            filename={`${displayInvoiceNumber(invoice.invoice_number)} delivery note`}
          />
        </div>
      </div>

      <div className="py-8 print:py-0">
        <DeliveryNoteDocument model={model} style={style} printMode showChop={showChop} />
      </div>
    </div>
  );
}
