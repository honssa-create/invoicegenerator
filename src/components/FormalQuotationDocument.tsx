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
  /** When set, shows PAYMENT TERMS in the meta block (invoice layouts). */
  paymentTerms?: string;
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
    '同事會於收到簽回報價單後正式安排',
    '香港免一個地址運費',
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
  paymentTermsLabel = 'Payment Terms',
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
  /** Right-meta payment terms row label (invoice only). */
  paymentTermsLabel?: string;
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
  const signName = model.companySignName || six[0] || 'Honour Label Limited';
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
        <h1 className="quo-title">{documentTitle}</h1>
      </div>

      <section className="quo-parties-grid mb-7">
        <div>
          <p className="label">{billingLabel}</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.billingAddress || '—'}</p>
        </div>
        <div>
          <p className="label">Ship To</p>
          <p className="quo-field whitespace-pre-wrap m-0">{model.shippingAddress || '—'}</p>
        </div>
        <div className="quo-meta-block">
          <p className="quo-meta-row">
            <span className="quo-meta-k">Order No.</span>
            <span className="quo-meta-v">{model.orderNo || '—'}</span>
          </p>
          <p className="quo-meta-row">
            <span className="quo-meta-k">{numberLabel}</span>
            <span className="quo-meta-v">{model.quotationNo || '—'}</span>
          </p>
          {model.paymentTerms !== undefined ? (
            <p className="quo-meta-row">
              <span className="quo-meta-k">{paymentTermsLabel}</span>
              <span className="quo-meta-v">{model.paymentTerms || '—'}</span>
            </p>
          ) : null}
          <p className="quo-meta-row">
            <span className="quo-meta-k">{dateLabel}</span>
            <span className="quo-meta-v">{model.date || '—'}</span>
          </p>
        </div>
      </section>

      <table className="quo-table-grid mb-7">
        <thead>
          <tr>
            <th className="quo-th accent-bg text-left">Description</th>
            <th className="quo-th accent-bg text-right">Qty</th>
            <th className="quo-th accent-bg text-right">Price</th>
            <th className="quo-th accent-bg text-right">Amount</th>
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
                <td className="text-right whitespace-nowrap">{item.rate}</td>
                <td className="text-right whitespace-nowrap">{item.amount}</td>
              </tr>
              {item.description ? (
                <tr>
                  <td colSpan={4} className="quo-item-desc whitespace-pre-wrap">
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
                  <p className="quo-payment-text m-0 whitespace-pre-wrap">
                    {model.remarks.join('\n')}
                  </p>
                ) : (
                  <>
                    <p className="m-0 mb-2 font-bold">Remarks:</p>
                    <ol className="quo-payment-text m-0 pl-5 space-y-1">
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
              <table className="w-full max-w-[260px] ml-auto">
                <tbody>
                  <tr>
                    <td className="py-1 quo-tot-label">Subtotal</td>
                    <td className="py-1 quo-tot-value">{model.subtotal}</td>
                  </tr>
                  <tr>
                    <td className="py-1 quo-tot-label">Discount</td>
                    <td className="py-1 quo-tot-value">{model.discount}</td>
                  </tr>
                  <tr className="quo-tot-grand">
                    <td className="pt-2 quo-tot-label">Total</td>
                    <td className="pt-2 quo-tot-value">{model.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {showAcceptedBy || showSignature ? (
        showAcceptedBy && showSignature ? (
          <footer className="quo-sign-footer quo-sign-footer--accept">
            <p className="quo-sign-accept-label">Accepted by &amp; Date</p>
            <div className="quo-sign-block-slot">
              <HonourLabelSignatureBlock
                signName={signName}
                chopSrc={model.chopSrc}
                showChop={showChop}
                hideAuth
              />
            </div>
            <div className="quo-sign-left-fill" aria-hidden="true" />
            <hr className="quo-sign-accept-line" />
            <hr className="quo-sign-auth-line-slot" />
            <p className="quo-sign-auth-label-slot">Authorized Signature</p>
          </footer>
        ) : showAcceptedBy ? (
          <footer className="quo-sign-accept-only">
            <p className="quo-sign-accept-label">Accepted by &amp; Date</p>
            <hr className="quo-sign-accept-line" />
          </footer>
        ) : (
          <footer className="quo-sign-only">
            <HonourLabelSignatureBlock
              signName={signName}
              chopSrc={model.chopSrc}
              showChop={showChop}
            />
          </footer>
        )
      ) : null}
      </div>

      <PrintPageNumbers total={pageCount} />
    </div>
  );
}
