'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FormalQuotationDocument from '@/components/FormalQuotationDocument';
import DepositInvoiceDocument from '@/components/DepositInvoiceDocument';
import BalanceInvoiceDocument from '@/components/BalanceInvoiceDocument';
import {
  invoiceToBalancePreview,
  invoiceToDepositPreview,
  invoiceToFormalPreview,
} from '@/lib/invoice-print';
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

/** Matches public/invoice-template-sign.html (chop) vs invoice-template.html (no chop). */
type PdfChopMode = 'chop' | 'no-chop';

/** Standard / deposit / balance HTML layout variants. */
type PdfLayoutMode = 'standard' | 'deposit' | 'balance';

const PDF_CHOP_STORAGE_KEY = 'invoice-pdf-chop';
const PDF_LAYOUT_STORAGE_KEY = 'invoice-pdf-layout';

const PDF_CHOP_OPTIONS: { id: PdfChopMode; label: string }[] = [
  { id: 'chop', label: bi('Chop', '公司章') },
  { id: 'no-chop', label: bi('No chop', '無公司章') },
];

const PDF_LAYOUT_OPTIONS: { id: PdfLayoutMode; label: string }[] = [
  { id: 'standard', label: bi('Standard', '標準') },
  { id: 'deposit', label: bi('Deposit', '訂金') },
  { id: 'balance', label: bi('Balance', '餘額') },
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

function loadPdfLayout(): PdfLayoutMode {
  if (typeof window === 'undefined') return 'standard';
  try {
    const raw = localStorage.getItem(PDF_LAYOUT_STORAGE_KEY);
    if (raw === 'standard' || raw === 'deposit' || raw === 'balance') return raw;
  } catch {
    /* ignore */
  }
  return 'standard';
}

export default function InvoicePrintPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [linkedOrderFields, setLinkedOrderFields] = useState<Record<
    string,
    string | boolean
  > | null>(null);
  const [style, setStyle] = useState<QuotationStyleTemplate>(DEFAULT_QUOTATION_STYLE);
  const [chopMode, setChopMode] = useState<PdfChopMode>('chop');
  const [layoutMode, setLayoutMode] = useState<PdfLayoutMode>('standard');

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setInvoice(d.invoice || null);
        setBusiness(d.business || null);
        const fields = d.linkedOrder?.fields;
        setLinkedOrderFields(
          fields && typeof fields === 'object' ? (fields as Record<string, string | boolean>) : null,
        );
      });
  }, [id]);

  useEffect(() => {
    setStyle(loadQuotationStyleFromStorage('label') || DEFAULT_QUOTATION_STYLE);
    setChopMode(loadPdfChop());
    setLayoutMode(loadPdfLayout());
  }, []);

  const setChopPersist = (mode: PdfChopMode) => {
    setChopMode(mode);
    try {
      localStorage.setItem(PDF_CHOP_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const setLayoutPersist = (mode: PdfLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem(PDF_LAYOUT_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!invoice) return;
    const key = `invoice-pdf-logged-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice', id, body: '🧾 Generated invoice PDF / print view' }),
    }).catch(() => {});
  }, [invoice, id]);

  const standardModel = useMemo(
    () => (invoice ? invoiceToFormalPreview(invoice, business) : null),
    [invoice, business],
  );

  const depositModel = useMemo(
    () => (invoice ? invoiceToDepositPreview(invoice, business) : null),
    [invoice, business],
  );

  const balanceModel = useMemo(
    () =>
      invoice
        ? invoiceToBalancePreview(invoice, business, {
            orderFields: invoice.order_id ? linkedOrderFields : null,
          })
        : null,
    [invoice, business, linkedOrderFields],
  );

  const isSplitDue = layoutMode === 'deposit' || layoutMode === 'balance';
  const showChop = chopMode === 'chop';
  const ready = invoice && standardModel && depositModel && balanceModel;

  if (!ready) {
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
            aria-label={bi('PDF layout', 'PDF 版式')}
          >
            {PDF_LAYOUT_OPTIONS.map((opt) => {
              const active = layoutMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLayoutPersist(opt.id)}
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
          {!isSplitDue ? (
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
          ) : null}
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            {BTN.printPdf}
          </button>
        </div>
      </div>

      <div className="py-8 print:py-0">
        {layoutMode === 'deposit' ? (
          <DepositInvoiceDocument model={depositModel} style={style} printMode />
        ) : layoutMode === 'balance' ? (
          <BalanceInvoiceDocument model={balanceModel} style={style} printMode />
        ) : (
          <FormalQuotationDocument
            model={standardModel}
            style={style}
            printMode
            showSum
            showSignature
            showChop={showChop}
            documentTitle="INVOICE"
            numberLabel="Invoice No."
            remarksMode="plain"
          />
        )}
      </div>
    </div>
  );
}
