'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DocumentTemplateShell from '@/components/document-templates/DocumentTemplateShell';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import FormalQuotationDocument, {
  DEFAULT_QUOTATION_PREVIEW,
  type QuotationPreviewModel,
} from '@/components/FormalQuotationDocument';
import DepositInvoiceDocument, {
  DEFAULT_DEPOSIT_INVOICE_PREVIEW,
  type DepositInvoicePreviewModel,
} from '@/components/DepositInvoiceDocument';
import BalanceInvoiceDocument, {
  DEFAULT_BALANCE_INVOICE_PREVIEW,
  type BalanceInvoicePreviewModel,
} from '@/components/BalanceInvoiceDocument';
import {
  INVOICE_COMPANY_VARIANTS,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';
import { defaultInvoicePaymentRemarks } from '@/lib/invoice-print';
import {
  DEFAULT_QUOTATION_STYLE,
  loadQuotationStyleFromStorage,
  normalizeQuotationStyle,
  QUOTATION_STYLE_FIELDS,
  saveQuotationStyleToStorage,
  type QuotationStyleField,
  type QuotationStyleTemplate,
} from '@/lib/quotation-style';
import { bi } from '@/lib/ui-labels';

interface Props {
  variant: TemplateCompanyVariantId;
  readOnly?: boolean;
}

type InvoiceLayoutId = 'standard' | 'deposit' | 'balance';

const LAYOUT_OPTIONS: { id: InvoiceLayoutId; label: string; htmlHref: string }[] = [
  {
    id: 'standard',
    label: bi('Standard', '標準'),
    htmlHref: '/invoice-template-sign.html',
  },
  {
    id: 'deposit',
    label: bi('Deposit', '訂金'),
    htmlHref: '/deposit-invoice-template.html',
  },
  {
    id: 'balance',
    label: bi('Balance', '餘額'),
    htmlHref: '/balance-invoice-template.html',
  },
];

function linesToText(lines: string[]): string {
  const padded = [...lines];
  while (padded.length < 6) padded.push('');
  return padded.slice(0, 6).join('\n');
}

function textToLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  while (lines.length < 6) lines.push('');
  return lines.slice(0, 6);
}

function EditorSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100/80"
      >
        <div>
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <span className="text-gray-400 text-xs shrink-0 ml-2">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="p-3 border-t border-gray-100 space-y-3">{children}</div>}
    </section>
  );
}

function colorPickerValue(value: string): string {
  return value.startsWith('#') && (value.length === 7 || value.length === 4) ? value : '#222222';
}

export default function InvoiceTemplateWorkspace({ variant, readOnly }: Props) {
  const variantLabel = INVOICE_COMPANY_VARIANTS.find((v) => v.id === variant)?.shortLabel ?? variant;

  const [layoutId, setLayoutId] = useState<InvoiceLayoutId>('standard');
  const [companyAddressText, setCompanyAddressText] = useState(
    linesToText(DEFAULT_DEPOSIT_INVOICE_PREVIEW.companyAddressLines),
  );
  const [paymentRemarks, setPaymentRemarks] = useState(
    defaultInvoicePaymentRemarks('<refnumber>'),
  );
  const [message, setMessage] = useState('<Message>');
  const [paymentTerms, setPaymentTerms] = useState('<term>');
  const [style, setStyle] = useState<QuotationStyleTemplate>({ ...DEFAULT_QUOTATION_STYLE });
  const [saveMessage, setSaveMessage] = useState('');
  const [showChop, setShowChop] = useState(true);
  const [savedStyleSnapshot, setSavedStyleSnapshot] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadQuotationStyleFromStorage(variant);
    const next = saved || { ...DEFAULT_QUOTATION_STYLE };
    setStyle(next);
    setSavedStyleSnapshot(JSON.stringify(next));
  }, [variant]);

  useUnsavedChangesWarning(
    !readOnly && savedStyleSnapshot !== null && JSON.stringify(style) !== savedStyleSnapshot,
  );

  const setField = useCallback((key: QuotationStyleField, value: string) => {
    setStyle((prev) => ({ ...prev, [key]: value }));
    setSaveMessage('');
  }, []);

  const resetStyle = () => {
    setStyle({ ...DEFAULT_QUOTATION_STYLE });
    setSaveMessage('');
  };

  const saveStyle = () => {
    if (readOnly) return;
    const normalized = normalizeQuotationStyle(style);
    saveQuotationStyleToStorage(variant, normalized);
    setSavedStyleSnapshot(JSON.stringify(normalized));
    setSaveMessage(bi('Layout saved on this device', '樣式已儲存在此裝置'));
    setTimeout(() => setSaveMessage(''), 2500);
  };

  const companyAddressLines = useMemo(
    () => textToLines(companyAddressText),
    [companyAddressText],
  );

  const standardModel: QuotationPreviewModel = useMemo(
    () => ({
      ...DEFAULT_QUOTATION_PREVIEW,
      companyAddressLines,
      billingAddress: DEFAULT_DEPOSIT_INVOICE_PREVIEW.billingAddress,
      shippingAddress: DEFAULT_DEPOSIT_INVOICE_PREVIEW.shippingAddress,
      orderNo: DEFAULT_DEPOSIT_INVOICE_PREVIEW.orderNo,
      quotationNo: DEFAULT_DEPOSIT_INVOICE_PREVIEW.invoiceNo,
      paymentTerms,
      date: DEFAULT_DEPOSIT_INVOICE_PREVIEW.date,
      items: DEFAULT_DEPOSIT_INVOICE_PREVIEW.items,
      message,
      remarks: [paymentRemarks],
      subtotal: DEFAULT_DEPOSIT_INVOICE_PREVIEW.subtotal,
      discount: DEFAULT_DEPOSIT_INVOICE_PREVIEW.discount,
      total: DEFAULT_DEPOSIT_INVOICE_PREVIEW.total,
      companySignName: companyAddressLines[0] || 'Honour Label Limited',
      logoSrc: '/company-logo.png',
      chopSrc: '/company-chop.png',
    }),
    [companyAddressLines, message, paymentRemarks, paymentTerms],
  );

  const depositModel: DepositInvoicePreviewModel = useMemo(
    () => ({
      ...DEFAULT_DEPOSIT_INVOICE_PREVIEW,
      companyAddressLines,
      message,
      paymentTerms,
      paymentRemarks,
      companySignName: companyAddressLines[0] || 'Honour Label Limited',
    }),
    [companyAddressLines, message, paymentTerms, paymentRemarks],
  );

  const balanceModel: BalanceInvoicePreviewModel = useMemo(
    () => ({
      ...DEFAULT_BALANCE_INVOICE_PREVIEW,
      companyAddressLines,
      message,
      paymentTerms,
      paymentRemarks,
      companySignName: companyAddressLines[0] || 'Honour Label Limited',
    }),
    [companyAddressLines, message, paymentTerms, paymentRemarks],
  );

  const activeHtml = LAYOUT_OPTIONS.find((o) => o.id === layoutId)?.htmlHref || LAYOUT_OPTIONS[0].htmlHref;

  if (variant !== 'label') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Invoice template for {variantLabel} is not available yet. Use Honour Label.
      </div>
    );
  }

  const preview =
    layoutId === 'deposit' ? (
      <DepositInvoiceDocument model={depositModel} style={style} />
    ) : layoutId === 'balance' ? (
      <BalanceInvoiceDocument model={balanceModel} style={style} />
    ) : (
      <FormalQuotationDocument
        model={standardModel}
        style={style}
        showSum
        showSignature
        showChop={showChop}
        showAcceptedBy={false}
        documentTitle="INVOICE"
        numberLabel="Invoice No."
        remarksMode="plain"
      />
    );

  const editor = (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Honour Label invoice layouts (standard, deposit, balance). Edit content and styles — preview
        updates instantly.
        <div className="mt-2">
          <Link href={activeHtml} target="_blank" className="font-medium text-brand-700 hover:underline">
            Open standalone HTML template ↗
          </Link>
        </div>
      </div>

      <EditorSection
        title={bi('Invoice layout 發票版式', 'Invoice layout 發票版式')}
        description={bi(
          'Standard · Deposit (訂金) · Balance (餘額)',
          '標準 · 訂金 · 餘額',
        )}
        defaultOpen
      >
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = layoutId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayoutId(opt.id)}
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
        {layoutId === 'standard' ? (
          <div className="flex flex-wrap gap-4 pt-1 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={showChop}
                onChange={(e) => setShowChop(e.target.checked)}
                className="rounded border-gray-300"
              />
              {bi('Show chop', '顯示公司章')}
            </label>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {layoutId === 'deposit'
              ? bi(
                  'Deposit due defaults to half the total. Chop is always shown.',
                  '訂金預設為總額一半。一律顯示公司章。',
                )
              : bi(
                  'Balance due defaults to half the total (or remaining unpaid when linked to an order). Chop is always shown.',
                  '餘額預設為總額一半（連結訂單時為未付餘額）。一律顯示公司章。',
                )}
          </p>
        )}
      </EditorSection>

      <EditorSection
        title={bi('Layout 樣式', 'Layout 樣式')}
        description={bi(
          'Text colour, field background, font size, accent, spacing',
          '文字顏色、欄位底色、字號、主題色、間距',
        )}
        defaultOpen={false}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {QUOTATION_STYLE_FIELDS.map((field) => {
            const value = style[field.key];
            return (
              <label key={field.key} className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1">
                  {field.labelZh} {field.label}
                </span>
                {field.type === 'color' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorPickerValue(value)}
                      disabled={readOnly}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="h-9 w-12 rounded border border-gray-200 cursor-pointer disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={value}
                      disabled={readOnly}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={value}
                    disabled={readOnly}
                    placeholder={field.placeholder}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 disabled:bg-gray-50"
                  />
                )}
              </label>
            );
          })}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={saveStyle}
              className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
            >
              {bi('Save layout', '儲存樣式')}
            </button>
            <button
              type="button"
              onClick={resetStyle}
              className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              {bi('Reset to default', '重設預設')}
            </button>
            {saveMessage && <span className="text-sm text-brand-700">{saveMessage}</span>}
          </div>
        )}
      </EditorSection>

      <EditorSection
        title={bi('Company address 公司地址', 'Company address 公司地址')}
        description={bi('6 lines · first line printed bold', '6 行 · 第一行粗體')}
      >
        <textarea
          value={companyAddressText}
          onChange={(e) => setCompanyAddressText(e.target.value)}
          disabled={readOnly}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
        />
      </EditorSection>

      {(layoutId === 'deposit' || layoutId === 'balance') && (
        <EditorSection title={bi('Payment terms 付款條款', 'Payment terms 付款條款')}>
          <input
            type="text"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
          />
        </EditorSection>
      )}

      <EditorSection title={bi('Message 訊息', 'Message 訊息')}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={readOnly}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
        />
      </EditorSection>

      <EditorSection
        title={bi('Payment remarks 付款備註', 'Payment remarks 付款備註')}
        description={bi(
          'Bank / cheque instructions (Invoice No. placeholder: <refnumber>)',
          '銀行／支票說明（發票編號佔位符：<refnumber>）',
        )}
      >
        <textarea
          value={paymentRemarks}
          onChange={(e) => setPaymentRemarks(e.target.value)}
          disabled={readOnly}
          rows={10}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
        />
      </EditorSection>

      <p className="text-xs text-gray-500">
        {bi(
          'Logo: public/company-logo.png · Chop: public/company-chop.png',
          '標誌：public/company-logo.png · 公司章：public/company-chop.png',
        )}
      </p>
    </div>
  );

  return <DocumentTemplateShell editor={editor} preview={preview} />;
}
