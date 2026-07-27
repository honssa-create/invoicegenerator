'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import DocumentTemplateShell from '@/components/document-templates/DocumentTemplateShell';
import FormalQuotationDocument, {
  DEFAULT_QUOTATION_PREVIEW,
  type QuotationPreviewModel,
} from '@/components/FormalQuotationDocument';
import {
  QUOTATION_COMPANY_VARIANTS,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';
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

export default function QuotationTemplateWorkspace({ variant, readOnly }: Props) {
  const variantLabel = QUOTATION_COMPANY_VARIANTS.find((v) => v.id === variant)?.shortLabel ?? variant;

  const [companyAddressText, setCompanyAddressText] = useState(
    linesToText(DEFAULT_QUOTATION_PREVIEW.companyAddressLines),
  );
  const [remarksText, setRemarksText] = useState(DEFAULT_QUOTATION_PREVIEW.remarks.join('\n'));

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
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Honour Label quotation layout. Edit company address (6 lines, first line bold) and remarks —
        preview updates instantly.
        <div className="mt-2">
          <Link
            href="/quotation-style-template.html"
            target="_blank"
            className="font-medium text-brand-700 hover:underline"
          >
            Open standalone HTML template ↗
          </Link>
        </div>
      </div>

      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-900">
          Company address 公司地址
          <span className="block text-xs font-normal text-gray-500 mt-0.5">
            6 lines · first line printed bold
          </span>
        </label>
        <textarea
          value={companyAddressText}
          onChange={(e) => setCompanyAddressText(e.target.value)}
          disabled={readOnly}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
          placeholder={'Company name\nAddress line 2\n...\nLine 6'}
        />
      </section>

      <section className="space-y-2">
        <label className="block text-sm font-semibold text-gray-900">
          Remarks 備註
          <span className="block text-xs font-normal text-gray-500 mt-0.5">One remark per line</span>
        </label>
        <textarea
          value={remarksText}
          onChange={(e) => setRemarksText(e.target.value)}
          disabled={readOnly}
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50"
        />
      </section>

      <p className="text-xs text-gray-500">
        {bi(
          'Logo file: public/company-logo.png · Style HTML: public/quotation-style-template.html',
          '標誌：public/company-logo.png · 樣式 HTML：public/quotation-style-template.html',
        )}
      </p>
    </div>
  );

  return (
    <DocumentTemplateShell
      editor={editor}
      preview={<FormalQuotationDocument model={previewModel} />}
    />
  );
}
