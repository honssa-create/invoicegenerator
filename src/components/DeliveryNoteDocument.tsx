'use client';

import { Fragment, useRef, type CSSProperties } from 'react';
import {
  DEFAULT_QUOTATION_STYLE,
  quotationStyleToCssVars,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';
import { PRINT_PAGE_HEIGHT_MM } from '@/lib/print-page-numbers';
import { QUOTATION_DOCUMENT_CSS } from '@/lib/quotation-document-css';
import HonourLabelSignatureBlock from '@/components/HonourLabelSignatureBlock';
import PrintPageNumbers, { useA4PrintPageCount } from '@/components/PrintPageNumbers';

/** Live preview / print of public/delivery-note.html and delivery-note-chop.html */

export interface DeliveryNoteLinePreview {
  name: string;
  description: string;
  qty: string;
}

export interface DeliveryNotePreviewModel {
  companyAddressLines: string[];
  billingAddress: string;
  shippingAddress: string;
  orderNo: string;
  invoiceNo: string;
  date: string;
  items: DeliveryNoteLinePreview[];
  message: string;
  companySignName?: string;
  logoSrc?: string;
  chopSrc?: string;
}

export const DEFAULT_DELIVERY_NOTE_PREVIEW: DeliveryNotePreviewModel = {
  companyAddressLines: [
    'Honour Label Limited',
    'Room 13, Block B, 2/F',
    'Wah Tat Industrial Center',
    '8 Wah Sing Street, Kwai Chung',
    'honour.com.hk',
    'hello@honour.com.hk',
  ],
  billingAddress: '<BillingAddress>',
  shippingAddress: '<ShippingAddress>',
  orderNo: '<custom1>',
  invoiceNo: '<refnumber>',
  date: '<Date>',
  items: [
    {
      name: '<Item>',
      description: '<ItemDescription>',
      qty: '<Qty>',
    },
  ],
  message: '<Message>',
  companySignName: 'Honour Label Limited',
  logoSrc: '/company-logo.png',
  chopSrc: '/company-chop.png',
};

export default function DeliveryNoteDocument({
  model = DEFAULT_DELIVERY_NOTE_PREVIEW,
  style = DEFAULT_QUOTATION_STYLE,
  printMode = false,
  showChop = true,
}: {
  model?: DeliveryNotePreviewModel;
  style?: QuotationStyleTemplate;
  /** Soften field backgrounds and page chrome for browser print / PDF. */
  printMode?: boolean;
  /** Matches delivery-note-chop.html (true) vs delivery-note.html (false). */
  showChop?: boolean;
}) {
  const lines = [...model.companyAddressLines];
  while (lines.length < 6) lines.push('');
  const six = lines.slice(0, 6);
  const cssVars = quotationStyleToCssVars(style);
  const items = model.items.length ? model.items : DEFAULT_DELIVERY_NOTE_PREVIEW.items;
  const signName = model.companySignName || six[0] || 'Honour Label Limited';
  const pageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pageCount = useA4PrintPageCount(pageRef, bodyRef);

  return (
    <div
      ref={pageRef}
      className={`quo-preview-page relative bg-white mx-auto ${printMode ? 'quo-print-mode shadow-none' : 'shadow-lg'}`}
      style={
        {
          width: '210mm',
          minHeight: `calc(${pageCount} * ${PRINT_PAGE_HEIGHT_MM}mm)`,
          padding: 'var(--quo-page-padding)',
          ...cssVars,
        } as CSSProperties
      }
    >
      <style>{QUOTATION_DOCUMENT_CSS}</style>

      <div ref={bodyRef}>
      <header className="flex justify-between items-start gap-6 mb-7">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={model.logoSrc || '/company-logo.png'}
            alt="Company logo"
            className="quo-logo block object-contain"
          />
        </div>
        <div className="quo-company-address text-right max-w-[280px]" style={{ fontSize: 'var(--quo-font-size)' }}>
          {six.map((line, i) => (
            <div key={i} className={i === 0 ? 'font-bold' : undefined}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </header>

      <div className="mb-7">
        <h1 className="quo-title">DELIVERY NOTE</h1>
      </div>

      <section className="quo-parties-grid mb-7">
        <div>
          <p className="label">Invoice To</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.billingAddress || '—'}</p>
        </div>
        <div>
          <p className="label">Ship To</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.shippingAddress || '—'}</p>
        </div>
        <div className="quo-meta-block">
          <p className="quo-meta-row">
            <span className="quo-meta-k">Order No</span>
            <span className="quo-meta-v">{model.orderNo || '—'}</span>
          </p>
          <p className="quo-meta-row">
            <span className="quo-meta-k">Invoice No</span>
            <span className="quo-meta-v">{model.invoiceNo || '—'}</span>
          </p>
          <p className="quo-meta-row">
            <span className="quo-meta-k">Date</span>
            <span className="quo-meta-v">{model.date || '—'}</span>
          </p>
        </div>
      </section>

      <table className="quo-table-grid mb-7">
        <thead>
          <tr>
            <th className="quo-th accent-bg text-left">Description</th>
            <th className="quo-th accent-bg text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <Fragment key={i}>
              <tr>
                <td>
                  <p className="font-bold m-0">
                    {i + 1}. {item.name || '—'}
                  </p>
                </td>
                <td className="text-right whitespace-nowrap">{item.qty}</td>
              </tr>
              {item.description ? (
                <tr>
                  <td colSpan={2} className="quo-item-desc whitespace-pre-wrap">
                    {item.description}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>

      {model.message ? (
        <section className="mb-10 max-w-[70%]">
          <p className="quo-field m-0 muted whitespace-pre-wrap" style={{ minHeight: '1.5em' }}>
            {model.message}
          </p>
        </section>
      ) : (
        <div className="mb-10" />
      )}

      <footer className="quo-footer-pay-sign">
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <HonourLabelSignatureBlock
          signName={signName}
          chopSrc={model.chopSrc}
          showChop={showChop}
        />
      </footer>
      </div>

      <PrintPageNumbers total={pageCount} />
    </div>
  );
}
