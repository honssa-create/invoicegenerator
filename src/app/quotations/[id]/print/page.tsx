'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import FormalQuotationDocument from '@/components/FormalQuotationDocument';
import { quotationToFormalPreview } from '@/lib/quotation-print';
import {
  DEFAULT_QUOTATION_STYLE,
  loadQuotationStyleFromStorage,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';
import type { QuotationWithDetails } from '@/lib/quotations';
import { BTN, bi } from '@/lib/ui-labels';

interface Business {
  name: string;
  company_name: string | null;
  email: string;
}

/** Matches the public HTML template variants. */
type PdfLayoutMode = 'sum-sign' | 'sum' | 'sign' | 'none';

const PDF_LAYOUT_STORAGE_KEY = 'quotation-pdf-layout';

const PDF_LAYOUT_OPTIONS: { id: PdfLayoutMode; label: string }[] = [
  { id: 'sum-sign', label: bi('Sum + Signature', '合計 + 簽署') },
  { id: 'sum', label: bi('Sum only', '僅合計') },
  { id: 'sign', label: bi('Signature only', '僅簽署') },
  { id: 'none', label: bi('Without sum & sign', '無合計與簽署') },
];

function loadPdfLayout(): PdfLayoutMode {
  if (typeof window === 'undefined') return 'sum-sign';
  try {
    const raw = localStorage.getItem(PDF_LAYOUT_STORAGE_KEY);
    if (raw === 'sum' || raw === 'sign' || raw === 'sum-sign' || raw === 'none') return raw;
  } catch {
    /* ignore */
  }
  return 'sum-sign';
}

export default function QuotationPrintPage() {
  const { id } = useParams();
  const [quote, setQuote] = useState<QuotationWithDetails | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [style, setStyle] = useState<QuotationStyleTemplate>(DEFAULT_QUOTATION_STYLE);
  const [layout, setLayout] = useState<PdfLayoutMode>('sum-sign');

  useEffect(() => {
    fetch(`/api/quotations/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setQuote(d.quotation || null);
        setBusiness(d.business || null);
      });
  }, [id]);

  useEffect(() => {
    setStyle(loadQuotationStyleFromStorage('label') || DEFAULT_QUOTATION_STYLE);
    setLayout(loadPdfLayout());
  }, []);

  const setLayoutPersist = (mode: PdfLayoutMode) => {
    setLayout(mode);
    try {
      localStorage.setItem(PDF_LAYOUT_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

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

  const model = useMemo(
    () => (quote ? quotationToFormalPreview(quote, business) : null),
    [quote, business],
  );

  const showSum = layout === 'sum-sign' || layout === 'sum';
  const showSignature = layout === 'sum-sign' || layout === 'sign';

  if (!quote || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/quotations/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          ← {bi('Back to quotation', '返回報價單')}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
            role="group"
            aria-label={bi('PDF layout', 'PDF 版面')}
          >
            {PDF_LAYOUT_OPTIONS.map((opt) => {
              const active = layout === opt.id;
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
          showSum={showSum}
          showSignature={showSignature}
        />
      </div>
    </div>
  );
}
