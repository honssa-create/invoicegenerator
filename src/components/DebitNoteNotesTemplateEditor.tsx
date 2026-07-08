'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadDebitNoteNotesTemplate } from '@/lib/debit-note-notes-document';
import {
  DEBIT_NOTE_COMPANY_PROFILES,
  DEBIT_NOTE_COMPANY_CHOICES,
  buildDebitNotePaymentInstructionsText,
  type DebitNoteCompanyId,
  type DebitNoteCompanyProfile,
} from '@/lib/rentals';
import type { RentalDocumentTemplate } from '@/lib/rental-templates';
import { DEFAULT_FOOTER_REMARK_TEMPLATE } from '@/lib/rental-templates';

type NotesDraft = {
  paymentInstructions: string;
  footerRemark: string;
  company: Partial<DebitNoteCompanyProfile>;
};

function defaultDraft(companyKey: DebitNoteCompanyId): NotesDraft {
  const profile = DEBIT_NOTE_COMPANY_PROFILES[companyKey];
  return {
    paymentInstructions: buildDebitNotePaymentInstructionsText(companyKey, 'DN-XXXXXX-0000', 'yyyy年mm月dd日'),
    footerRemark: DEFAULT_FOOTER_REMARK_TEMPLATE,
    company: { ...profile },
  };
}

interface Props {
  companyKey: DebitNoteCompanyId;
  draft: NotesDraft;
  onChange: (draft: NotesDraft) => void;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
  saving?: boolean;
  saveMessage?: string;
  className?: string;
}

export default function DebitNoteNotesTemplateEditor({
  companyKey,
  draft,
  onChange,
  onSave,
  readOnly,
  saving,
  saveMessage,
  className = '',
}: Props) {
  const [open, setOpen] = useState(true);
  const companyLabel = DEBIT_NOTE_COMPANY_CHOICES.find((c) => c.id === companyKey)?.label ?? companyKey;

  const setCompanyField = (key: keyof DebitNoteCompanyProfile, value: string) => {
    onChange({ ...draft, company: { ...draft.company, [key]: value } });
  };

  const reset = () => onChange(defaultDraft(companyKey));

  const downloadTemplate = {
    name: companyLabel,
    paymentInstructions: draft.paymentInstructions,
    footerRemark: draft.footerRemark,
    company: draft.company,
  } satisfies Pick<RentalDocumentTemplate, 'paymentInstructions' | 'footerRemark' | 'company' | 'name'>;

  return (
    <section className={`border border-gray-200 rounded-xl bg-white overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50 hover:bg-gray-100/80"
      >
        <span className="font-semibold text-gray-900">Notes 付款備註 — {companyLabel}</span>
        <span className="text-gray-400 text-sm">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Payment instructions, footer remark, and company header for debit notes.
            Placeholders: {'{{noteNo}}'}, {'{{dueDateChinese}}'}, {'{{chequePayee}}'}, {'{{bankLines}}'}, {'{{dueDate}}'}, {'{{amount}}'}.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {([
              ['nameZh', '中文名稱'],
              ['nameEn', 'English name'],
              ['address', 'Address 地址'],
              ['phone', 'Phone 電話'],
              ['taxId', 'Tax ID 稅務編號'],
              ['chequePayee', 'Cheque payee 支票抬頭'],
            ] as const).map(([key, label]) => (
              <label key={key} className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
                <input
                  type="text"
                  value={draft.company[key] ?? ''}
                  disabled={readOnly}
                  onChange={(e) => setCompanyField(key, e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Payment instructions 付款指示</span>
            <textarea
              rows={12}
              value={draft.paymentInstructions}
              disabled={readOnly}
              onChange={(e) => onChange({ ...draft, paymentInstructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-sans leading-relaxed disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Footer remark 底部備註</span>
            <textarea
              rows={3}
              value={draft.footerRemark}
              disabled={readOnly}
              onChange={(e) => onChange({ ...draft, footerRemark: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => downloadDebitNoteNotesTemplate(companyKey, downloadTemplate, 'doc')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Download doc 下載範本
            </button>
            <button
              type="button"
              onClick={() => downloadDebitNoteNotesTemplate(companyKey, downloadTemplate, 'html')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Download HTML
            </button>
            {!readOnly && (
              <>
                {onSave && (
                  <button
                    type="button"
                    onClick={() => void onSave()}
                    disabled={saving}
                    className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save template 儲存範本'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                >
                  Reset to default 重設
                </button>
                {saveMessage && <span className="text-sm text-brand-700">{saveMessage}</span>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function useDebitNoteNotesTemplate(companyKey: DebitNoteCompanyId, readOnly?: boolean) {
  const [draft, setDraft] = useState<NotesDraft>(() => defaultDraft(companyKey));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/rental-templates')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data) => {
        const tpl = data?.templates?.find((t: RentalDocumentTemplate) => t.templateKey === companyKey);
        if (tpl) {
          setDraft({
            paymentInstructions: tpl.paymentInstructions,
            footerRemark: tpl.footerRemark,
            company: tpl.company ?? DEBIT_NOTE_COMPANY_PROFILES[companyKey],
          });
        } else {
          setDraft(defaultDraft(companyKey));
        }
      })
      .finally(() => setLoading(false));
  }, [companyKey]);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMessage('');
    const res = await fetch(`/api/rental-templates/${encodeURIComponent(companyKey)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentInstructions: draft.paymentInstructions,
        footerRemark: draft.footerRemark,
        company: draft.company,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSaveMessage(data.error || 'Save failed');
      return;
    }
    if (data.template) {
      setDraft({
        paymentInstructions: data.template.paymentInstructions,
        footerRemark: data.template.footerRemark,
        company: data.template.company ?? draft.company,
      });
    }
    setSaveMessage('Template saved ✓');
    setTimeout(() => setSaveMessage(''), 3000);
  }, [readOnly, draft, companyKey]);

  return { draft, setDraft, loading, saving, saveMessage, save };
}
