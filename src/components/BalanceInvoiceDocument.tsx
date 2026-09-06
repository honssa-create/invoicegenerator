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

/** Live preview / print of public/balance-invoice-template.html */

export interface BalanceInvoiceLinePreview {
  name: string;
  description: string;
  qty: string;
  rate: string;
  amount: string;
}

export interface BalanceInvoicePreviewModel {
  companyAddressLines: string[];
  billingAddress: string;
  shippingAddress: string;
  orderNo: string;
  invoiceNo: string;
  paymentTerms: string;
  date: string;
  items: BalanceInvoiceLinePreview[];
  message: string;
  /** Plain payment / bank instructions (footer left, beside chop). */
  paymentRemarks: string;
  subtotal: string;
  discount: string;
  total: string;
  balanceDue: string;
  companySignName?: string;
  logoSrc?: string;
  chopSrc?: string;
}

export const DEFAULT_BALANCE_INVOICE_PREVIEW: BalanceInvoicePreviewModel = {
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
  paymentTerms: '<term>',
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
  paymentRemarks: `We accept both cheque payment and bank transfer
(Please remark the Invoice No: <refnumber> on the cheque or in the bank transfer note.)
-
Crossed cheque made payable to “Honour Label Limited”
And mail to above address
-
Bank transfer detail:
374-279610-001
HONOUR LABEL LIMITED
HANG SENG BANK (bank code : 024)
-`,
  subtotal: '<Subtotal>',
  discount: '<DiscountBeforeTax>',
  total: '<Total>',
  balanceDue: '<balance>',
  companySignName: 'Honour Label Limited',
  logoSrc: '/company-logo.png',
  chopSrc: '/company-chop.png',
};

export default function BalanceInvoiceDocument({
  model = DEFAULT_BALANCE_INVOICE_PREVIEW,
  style = DEFAULT_QUOTATION_STYLE,
  printMode = false,
}: {
  model?: BalanceInvoicePreviewModel;
  style?: QuotationStyleTemplate;
  /** Soften field backgrounds and page chrome for browser print / PDF. */
  printMode?: boolean;
}) {
  const lines = [...model.companyAddressLines];
  while (lines.length < 6) lines.push('');
  const six = lines.slice(0, 6);
  const cssVars = quotationStyleToCssVars(style);
  const items = model.items.length ? model.items : DEFAULT_BALANCE_INVOICE_PREVIEW.items;
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
        <h1 className="quo-title">BALANCE INVOICE</h1>
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
            <span className="quo-meta-k">Payment Terms</span>
            <span className="quo-meta-v">{model.paymentTerms || '—'}</span>
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

      <section className="grid grid-cols-[1.4fr_1fr] gap-6 mb-10">
        <div>
          {model.message ? (
            <p className="quo-field m-0 muted whitespace-pre-wrap" style={{ minHeight: '1.5em' }}>
              {model.message}
            </p>
          ) : null}
        </div>
        <div>
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
              <tr className="quo-tot-grand">
                <td className="pt-2 quo-tot-label">Balance Due</td>
                <td className="pt-2 quo-tot-value">{model.balanceDue}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer className="quo-footer-pay-sign">
        <div>
          <p className="quo-payment-text m-0 whitespace-pre-wrap text-left">
            {model.paymentRemarks}
          </p>
        </div>
        <div aria-hidden="true" />
        <HonourLabelSignatureBlock signName={signName} chopSrc={model.chopSrc} />
      </footer>
      </div>

      <PrintPageNumbers total={pageCount} />
    </div>
  );
}
