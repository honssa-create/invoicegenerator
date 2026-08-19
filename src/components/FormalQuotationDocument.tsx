'use client';

import { Fragment, useRef, type CSSProperties } from 'react';
import {
  DEFAULT_QUOTATION_STYLE,
  quotationStyleToCssVars,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';
import { PRINT_PAGE_HEIGHT_MM } from '@/lib/print-page-numbers';
import PrintPageNumbers, { useA4PrintPageCount } from '@/components/PrintPageNumbers';

/** Live preview / print of the Honour Label quotation layout (mirrors public/quotation-template-*.html). */

export interface QuotationLinePreview {
  name: string;
  description: string;
  qty: string;
  rate: string;
  amount: string;
}

export interface QuotationPreviewModel {
  companyAddressLines: string[];
  billingAddress: string;
  shippingAddress: string;
  orderNo: string;
  quotationNo: string;
  date: string;
  items: QuotationLinePreview[];
  message: string;
  remarks: string[];
  subtotal: string;
  discount: string;
  total: string;
  companySignName?: string;
  logoSrc?: string;
  /** Company chop image (shown with signature block when HTML templates include it). */
  chopSrc?: string;
}

export const DEFAULT_QUOTATION_PREVIEW: QuotationPreviewModel = {
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
  quotationNo: '<refnumber>',
  date: '<Date>',
  items: [
    {
      name: '<Item>',
      description: '<ItemDescription>',
      qty: '<Qty>',
      rate: '<Rate>',
      amount: '<Amount>',
    },
  ],
  message: '<Message>',
  remarks: [
    '請刪去不適用並安排以公司名義蓋印及簽回報價單作確認',
    '同事會於收到簽回報價單後正式安排, 香港免一個地址運費',
    '貨期會於簽回報價單及最終的效果圖確認後, 正式開始計算',
    '付款方式：支票,銀行轉帳及轉數快, 詳細資料將會列於invoice上',
  ],
  subtotal: '<Subtotal>',
  discount: '<DiscountBeforeTax>',
  total: '<Total>',
  companySignName: 'Honour Label Limited',
  logoSrc: '/company-logo.png',
  chopSrc: '/company-chop.png',
};

export default function FormalQuotationDocument({
  model = DEFAULT_QUOTATION_PREVIEW,
  style = DEFAULT_QUOTATION_STYLE,
  printMode = false,
  showSum = true,
  showSignature = true,
  showChop = true,
  showAcceptedBy = true,
  documentTitle = 'QUOTATION',
  numberLabel = 'Quotation No.',
  dateLabel = 'Date',
  billingLabel = 'Invoice To',
  remarksMode = 'list',
}: {
  model?: QuotationPreviewModel;
  style?: QuotationStyleTemplate;
  /** Soften field backgrounds and page chrome for browser print / PDF. */
  printMode?: boolean;
  /** Show Subtotal / Discount / Total block. */
  showSum?: boolean;
  /** Show company “For and on behalf of …” signature block. */
  showSignature?: boolean;
  /** Show company chop image inside the signature block (sum-sign / sign HTML). */
  showChop?: boolean;
  /** Show left “Accepted by & Date” signature line. */
  showAcceptedBy?: boolean;
  /** Document heading (QUOTATION / INVOICE). */
  documentTitle?: string;
  /** Right-meta number row label. */
  numberLabel?: string;
  /** Right-meta date row label. */
  dateLabel?: string;
  /** Left address column label (Invoice To / To). */
  billingLabel?: string;
  /** Quotation uses a numbered Remarks list; invoice HTML uses plain payment text. */
  remarksMode?: 'list' | 'plain';
}) {
  const lines = [...model.companyAddressLines];
  while (lines.length < 6) lines.push('');
  const six = lines.slice(0, 6);
  const cssVars = quotationStyleToCssVars(style);
  const items = model.items.length ? model.items : DEFAULT_QUOTATION_PREVIEW.items;
  const hasRemarksBlock = Boolean(model.message) || model.remarks.length > 0;
  const showBottom = hasRemarksBlock || showSum;
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
      <style>{`
        .quo-preview-page {
          font-family: var(--quo-font-family);
          font-size: var(--quo-font-size);
          line-height: var(--quo-line-height);
          color: var(--quo-color-text);
        }
        .quo-preview-page .accent { color: var(--quo-color-accent); }
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
          left: 0;
          right: 0;
          height: 297mm;
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          padding: 0 52px 24px 0;
          font-size: var(--quo-page-number-size);
          line-height: 1;
          color: var(--quo-page-number-color);
          text-align: right;
          pointer-events: none;
          user-select: none;
          z-index: 2;
        }
        .quo-preview-page .quo-title {
          color: var(--quo-color-accent);
          font-size: var(--quo-title-size);
          font-weight: 700;
          letter-spacing: 0.04em;
          margin: 0;
          line-height: 1;
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
        @media print {
          @page { size: A4 portrait; margin: 0; }
          .quo-preview-page {
            width: 100% !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .quo-preview-page .accent-bg {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

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
        <div className="text-right leading-[1.4] max-w-[280px]" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
          {six.map((line, i) => (
            <div key={i} className={i === 0 ? 'font-bold' : undefined} style={i === 0 ? { fontSize: 'var(--quo-font-size)' } : undefined}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </header>

      <div className="mb-7">
        <h1 className="quo-title">{documentTitle}</h1>
        <hr className="quo-rule mt-2.5" />
      </div>

      <section className="grid grid-cols-3 gap-4 mb-7">
        <div>
          <p className="label mb-2">{billingLabel}</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.billingAddress || '—'}</p>
        </div>
        <div>
          <p className="label mb-2">Ship To</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.shippingAddress || '—'}</p>
        </div>
        <div className="text-right space-y-1.5" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
          <p className="m-0">
            <span className="muted font-bold uppercase tracking-wide inline-block min-w-[7.5em] text-right mr-2.5">Order No.</span>
            <span className="inline-block min-w-[5.5em] text-left">{model.orderNo || '—'}</span>
          </p>
          <p className="m-0">
            <span className="muted font-bold uppercase tracking-wide inline-block min-w-[7.5em] text-right mr-2.5">{numberLabel}</span>
            <span className="inline-block min-w-[5.5em] text-left">{model.quotationNo || '—'}</span>
          </p>
          <p className="m-0">
            <span className="muted font-bold uppercase tracking-wide inline-block min-w-[7.5em] text-right mr-2.5">{dateLabel}</span>
            <span className="inline-block min-w-[5.5em] text-left">{model.date || '—'}</span>
          </p>
        </div>
      </section>

      <table className="w-full border-collapse mb-7" style={{ fontSize: 'var(--quo-font-size)' }}>
        <thead>
          <tr>
            <th className="quo-th accent-bg text-left font-bold tracking-wider uppercase px-3 py-2.5">Description</th>
            <th className="quo-th accent-bg text-right font-bold tracking-wider uppercase px-3 py-2.5">Qty</th>
            <th className="quo-th accent-bg text-right font-bold tracking-wider uppercase px-3 py-2.5">Price</th>
            <th className="quo-th accent-bg text-right font-bold tracking-wider uppercase px-3 py-2.5">Amount</th>
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
                <td className="px-3 pt-3.5 pb-1 text-right align-top whitespace-nowrap">{item.rate}</td>
                <td className="px-3 pt-3.5 pb-1 text-right align-top whitespace-nowrap">{item.amount}</td>
              </tr>
              {item.description ? (
                <tr className="border-b border-gray-200">
                  <td
                    colSpan={4}
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

      {showBottom ? (
        <section
          className={`mb-10 ${showSum && hasRemarksBlock ? 'grid grid-cols-[1.4fr_1fr] gap-6' : ''}`}
        >
          {hasRemarksBlock ? (
            <div>
              {model.message ? (
                <p className="quo-field m-0 mb-4 muted whitespace-pre-wrap" style={{ minHeight: '1.5em' }}>
                  {model.message}
                </p>
              ) : null}
              {model.remarks.length > 0 ? (
                remarksMode === 'plain' ? (
                  <p
                    className="m-0 whitespace-pre-wrap leading-relaxed"
                    style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}
                  >
                    {model.remarks.join('\n')}
                  </p>
                ) : (
                  <>
                    <p className="m-0 mb-2 font-bold">Remarks:</p>
                    <ol className="m-0 pl-5 leading-relaxed space-y-1" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
                      {model.remarks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ol>
                  </>
                )
              ) : null}
            </div>
          ) : null}
          {showSum ? (
            <div className={!hasRemarksBlock ? 'ml-auto' : undefined}>
              <table className="w-full max-w-[260px] ml-auto" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
                <tbody>
                  <tr>
                    <td className="py-1 text-right muted font-bold uppercase tracking-wide pr-4">Subtotal</td>
                    <td className="py-1 text-right min-w-[90px]">{model.subtotal}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-right muted font-bold uppercase tracking-wide pr-4">Discount</td>
                    <td className="py-1 text-right">{model.discount}</td>
                  </tr>
                  <tr>
                    <td className="pt-2 text-right font-bold pr-4" style={{ fontSize: 'calc(var(--quo-font-size) * 1.08)' }}>
                      Total
                    </td>
                    <td className="pt-2 text-right font-bold" style={{ fontSize: 'calc(var(--quo-font-size) * 1.08)' }}>
                      {model.total}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {showAcceptedBy || showSignature ? (
        <footer
          className={`mt-6 ${
            showAcceptedBy && showSignature
              ? 'grid grid-cols-2 gap-6'
              : showSignature
                ? 'flex justify-end'
                : ''
          }`}
        >
          {showAcceptedBy ? (
            <div className={showSignature ? 'self-end' : 'w-1/2'}>
              <p className="m-0 mb-7">Accepted by &amp; Date</p>
              <hr className="border-0 border-t border-gray-800 w-[85%] m-0" />
            </div>
          ) : null}
          {showSignature ? (
            <div className={`text-center self-end ${showAcceptedBy ? '' : 'w-1/2'}`}>
              <p className="m-0 mb-2.5 whitespace-pre-line" style={{ fontSize: 'calc(var(--quo-font-size) * 0.92)' }}>
                {'For and on behalf of\nHonour Label Limited'}
              </p>
              {showChop ? (
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
          ) : null}
        </footer>
      ) : null}
      </div>

      <PrintPageNumbers total={pageCount} />
    </div>
  );
}
