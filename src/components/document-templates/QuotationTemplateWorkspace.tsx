'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DocumentTemplateShell from '@/components/document-templates/DocumentTemplateShell';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import FormalQuotationDocument, {
  DEFAULT_QUOTATION_PREVIEW,
  type QuotationPreviewModel,
} from '@/components/FormalQuotationDocument';
import {
  QUOTATION_COMPANY_VARIANTS,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';
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

export default function QuotationTemplateWorkspace({ variant, readOnly }: Props) {
  const variantLabel = QUOTATION_COMPANY_VARIANTS.find((v) => v.id === variant)?.shortLabel ?? variant;

  const [companyAddressText, setCompanyAddressText] = useState(
    linesToText(DEFAULT_QUOTATION_PREVIEW.companyAddressLines),
  );
  const [remarksText, setRemarksText] = useState(DEFAULT_QUOTATION_PREVIEW.remarks.join('\n'));
  const [style, setStyle] = useState<QuotationStyleTemplate>({ ...DEFAULT_QUOTATION_STYLE });
  const [saveMessage, setSaveMessage] = useState('');
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

  const previewModel: QuotationPreviewModel = useMemo(
    () => ({
      ...DEFAULT_QUOTATION_PREVIEW,
      companyAddressLines: textToLines(companyAddressText),
      remarks: remarksText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    }),
    [companyAddressText, remarksText],
  );

  if (variant !== 'label') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Quotation template for {variantLabel} is not available yet. Use Honour Label.
      </div>
    );
  }

  const editor = (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Honour Label quotation layout. Edit content and layout styles — preview updates instantly.
        <div className="mt-2">
          <Link
            href="/quotation-template-sum-sign.html"
            target="_blank"
            className="font-medium text-brand-700 hover:underline"
          >
            Open standalone HTML template ↗
          </Link>
        </div>
      </div>

      <EditorSection
        title={bi('Layout 樣式', 'Layout 樣式')}
        description={bi(
          'Text colour, field background, font size, accent, spacing',
          '文字顏色、欄位底色、字號、主題色、間距',
        )}
        defaultOpen
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
          placeholder={'Company name\nAddress line 2\n...\nLine 6'}
        />
      </EditorSection>

      <EditorSection
        title={bi('Remarks 備註', 'Remarks 備註')}
        description={bi('One remark per line', '每行一則備註')}
      >
        <textarea
          value={remarksText}
          onChange={(e) => setRemarksText(e.target.value)}
          disabled={readOnly}
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
        />
      </EditorSection>

      <p className="text-xs text-gray-500">
        {bi(
          'Logo file: public/company-logo.png · Style HTML: public/quotation-template-sum-sign.html',
          '標誌：public/company-logo.png · 樣式 HTML：public/quotation-template-sum-sign.html',
        )}
      </p>
    </div>
  );

  return (
    <DocumentTemplateShell
      editor={editor}
      preview={<FormalQuotationDocument model={previewModel} style={style} />}
    />
  );
}
