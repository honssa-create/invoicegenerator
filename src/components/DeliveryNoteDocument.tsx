'use client';

import { Fragment, type CSSProperties } from 'react';
import {
  DEFAULT_QUOTATION_STYLE,
  quotationStyleToCssVars,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';

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

  return (
    <div
      className={`quo-preview-page relative bg-white mx-auto ${printMode ? 'quo-print-mode shadow-none' : 'shadow-lg'}`}
      style={
        {
          width: '210mm',
          minHeight: '297mm',
          padding: 'var(--quo-page-padding)',
          ...cssVars,
        } as CSSProperties
      }
    >
      <style>{`
        .quo-preview-page {
          font-family: var(--quo-font-family);
          font-size: var(--quo-font-size);
          line-height: var(--quo-line-height);
          color: var(--quo-color-text);
        }
        .quo-preview-page .accent-bg {
          background: var(--quo-color-accent);
          color: var(--quo-color-accent-text);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .quo-preview-page .muted { color: var(--quo-color-muted); }
        .quo-preview-page .label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--quo-color-label);
        }
        .quo-preview-page .quo-field {
          background: var(--quo-field-bg);
          border-radius: 2px;
          padding: 4px 6px;
          min-height: 4.5em;
        }
        .quo-preview-page.quo-print-mode .quo-field {
          background: transparent;
          padding: 0;
        }
        .quo-preview-page .quo-rule {
          border: 0;
          border-top: 2px solid var(--quo-color-rule);
        }
        .quo-preview-page .quo-page-number {
          position: absolute;
          right: 52px;
          bottom: 24px;
          font-size: var(--quo-page-number-size);
          line-height: 1;
          color: var(--quo-page-number-color);
          text-align: right;
          pointer-events: none;
          user-select: none;
        }
        .quo-preview-page .quo-title {
          color: var(--quo-color-accent);
          font-size: var(--quo-title-size);
          font-weight: 700;
          letter-spacing: 0.04em;
          margin: 0;
          line-height: 1.1;
        }
        .quo-preview-page .quo-th {
          font-size: var(--quo-table-header-size);
        }
        .quo-preview-page .quo-logo {
          max-height: var(--quo-logo-max-height);
          max-width: var(--quo-logo-max-width);
        }
        .quo-preview-page .quo-chop {
          display: block;
          max-height: 88px;
          max-width: 88px;
          width: auto;
          height: auto;
          object-fit: contain;
          margin: 8px auto 4px;
        }
        .quo-preview-page .quo-meta-k {
          display: inline-block;
          min-width: 7.5em;
          text-align: right;
          color: var(--quo-color-label);
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-right: 10px;
        }
        .quo-preview-page .quo-meta-v {
          display: inline-block;
          min-width: 5.5em;
          text-align: left;
        }
        .quo-preview-page .quo-order-no-k {
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--quo-color-label);
          margin-right: 8px;
          font-size: 11px;
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          .quo-preview-page {
            width: 100% !important;
            min-height: auto !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .quo-preview-page .quo-page-number {
            position: fixed;
            right: 14mm;
            bottom: 10mm;
            z-index: 9999;
          }
          .quo-preview-page .accent-bg {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <header className="flex justify-between items-start gap-6 mb-7">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={model.logoSrc || '/company-logo.png'}
            alt="Company logo"
            className="quo-logo block object-contain"
          />
        </div>
        <div
          className="text-right leading-[1.4] max-w-[280px]"
          style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}
        >
          {six.map((line, i) => (
            <div
              key={i}
              className={i === 0 ? 'font-bold' : undefined}
              style={i === 0 ? { fontSize: 'var(--quo-font-size)' } : undefined}
            >
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </header>

      <div className="mb-7">
        <h1 className="quo-title">DELIVERY NOTE</h1>
        <hr className="quo-rule mt-2.5" />
      </div>

      <section className="grid grid-cols-3 gap-4 mb-7">
        <div>
          <p className="label mb-2">Invoice To</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.billingAddress || '—'}</p>
          <p className="m-0 mt-3" style={{ fontSize: 'var(--quo-font-size)' }}>
            <span className="quo-order-no-k">Order No</span>
            <span>{model.orderNo || '—'}</span>
          </p>
        </div>
        <div>
          <p className="label mb-2">Ship To</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.shippingAddress || '—'}</p>
        </div>
        <div className="text-right space-y-1.5" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
          <p className="m-0">
            <span className="quo-meta-k">Invoice No</span>
            <span className="quo-meta-v">{model.invoiceNo || '—'}</span>
          </p>
          <p className="m-0">
            <span className="quo-meta-k">Date</span>
            <span className="quo-meta-v">{model.date || '—'}</span>
          </p>
        </div>
      </section>

      <table className="w-full border-collapse mb-7" style={{ fontSize: 'var(--quo-font-size)' }}>
        <thead>
          <tr>
            <th className="quo-th accent-bg text-left font-bold tracking-wider uppercase px-3 py-2.5">
              Description
            </th>
            <th className="quo-th accent-bg text-right font-bold tracking-wider uppercase px-3 py-2.5">
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <Fragment key={i}>
              <tr className={item.description ? undefined : 'border-b border-gray-200'}>
                <td className="px-3 pt-3.5 pb-1 align-top">
                  <p className="font-bold m-0">
                    {i + 1}. {item.name || '—'}
                  </p>
                </td>
                <td className="px-3 pt-3.5 pb-1 text-right align-top whitespace-nowrap">{item.qty}</td>
              </tr>
              {item.description ? (
                <tr className="border-b border-gray-200">
                  <td
                    colSpan={2}
                    className="px-3 pt-0 pb-3.5 align-top muted whitespace-pre-wrap"
                    style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}
                  >
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

      <footer className="mt-6 grid grid-cols-2 gap-6 items-start">
        <div aria-hidden="true" />
        <div className="text-center">
          <p className="m-0 mb-2.5" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
            For and on behalf of {signName}
          </p>
          {showChop ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="quo-chop"
              src={model.chopSrc || '/company-chop.png'}
              alt="Company chop"
            />
          ) : null}
          <hr
            className={`border-0 border-t border-gray-800 w-[70%] mx-auto mb-2 ${
              showChop ? 'mt-3' : 'mt-[72px]'
            }`}
          />
          <p className="m-0" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
            Authorized Signature
          </p>
        </div>
      </footer>

      <div className="quo-page-number" aria-label="Page number">
        1
      </div>
    </div>
  );
}
