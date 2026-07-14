'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadDebitNoteNotesTemplate } from '@/lib/debit-note-notes-document';
import {
  DEBIT_NOTE_COMPANY_PROFILES,
  type DebitNoteCompanyProfile,
} from '@/lib/rentals';
import type { RentalDocumentTemplate } from '@/lib/rental-templates';
import {
  DEBIT_NOTE_COMPANY_VARIANTS,
  defaultDebitNoteNotesDraft,
  defaultJointCompanyProfile,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';

const META_PLACEHOLDERS = new Set(['(公司地址)', '(電話)', '(稅務編號)']);

export type NotesDraft = {
  paymentInstructions: string;
  footerRemark: string;
  company: Partial<DebitNoteCompanyProfile>;
};

function cleanMetaField(value: string | undefined | null): string {
  const trimmed = value?.trim() || '';
  return META_PLACEHOLDERS.has(trimmed) ? '' : trimmed;
}

function defaultProfileForVariant(variant: TemplateCompanyVariantId): Partial<DebitNoteCompanyProfile> {
  if (variant === 'joint') return defaultJointCompanyProfile();
  return { ...DEBIT_NOTE_COMPANY_PROFILES[variant] };
}

function normalizeCompany(
  variant: TemplateCompanyVariantId,
  company: Partial<DebitNoteCompanyProfile> | null | undefined,
): Partial<DebitNoteCompanyProfile> {
  const defaults = defaultProfileForVariant(variant);
  const c = { ...defaults, ...company };
  return {
    ...c,
    address: cleanMetaField(c.address),
    phone: cleanMetaField(c.phone),
    taxId: cleanMetaField(c.taxId),
  };
}

function defaultDraft(variant: TemplateCompanyVariantId): NotesDraft {
  return defaultDebitNoteNotesDraft(variant);
}

function draftFromTemplate(variant: TemplateCompanyVariantId, tpl: RentalDocumentTemplate): NotesDraft {
  return {
    paymentInstructions: tpl.paymentInstructions,
    footerRemark: tpl.footerRemark,
    company: normalizeCompany(variant, tpl.company),
  };
}

export type NotesEditorSection = 'all' | 'header' | 'notes';

interface Props {
  companyKey: TemplateCompanyVariantId;
  draft: NotesDraft;
  onChange: (draft: NotesDraft) => void;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
  saving?: boolean;
  saveMessage?: string;
  className?: string;
  embedded?: boolean;
  section?: NotesEditorSection;
  /** Ref callback for focusing textareas when inserting variables. */
  onRegisterTextarea?: (key: 'paymentInstructions' | 'footerRemark', el: HTMLTextAreaElement | null) => void;
  onFocusField?: (key: 'paymentInstructions' | 'footerRemark') => void;
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
  embedded = false,
  section = 'all',
  onRegisterTextarea,
  onFocusField,
}: Props) {
  const [open, setOpen] = useState(true);
  const companyLabel = DEBIT_NOTE_COMPANY_VARIANTS.find((c) => c.id === companyKey)?.shortLabel ?? companyKey;

  const setCompanyField = (key: keyof DebitNoteCompanyProfile, value: string) => {
    onChange({ ...draft, company: { ...draft.company, [key]: value } });
  };

  const reset = () => onChange(defaultDraft(companyKey));

  const downloadKey = companyKey === 'joint' ? 'label' : companyKey;
  const downloadTemplate = {
    name: DEBIT_NOTE_COMPANY_VARIANTS.find((c) => c.id === companyKey)?.label ?? companyKey,
    paymentInstructions: draft.paymentInstructions,
    footerRemark: draft.footerRemark,
    company: draft.company,
  } satisfies Pick<RentalDocumentTemplate, 'paymentInstructions' | 'footerRemark' | 'company' | 'name'>;

  const showHeader = section === 'all' || section === 'header';
  const showNotes = section === 'all' || section === 'notes';
  const showActions = section === 'all';

  const formBody = (
    <div className={embedded ? 'space-y-4' : 'p-4 space-y-4 border-t border-gray-100'}>
      {!embedded && section === 'all' && (
        <p className="text-xs text-gray-500">
          Payment instructions, footer remark, and company header for debit notes.
          Placeholders: {'{{noteNo}}'}, {'{{dueDateChinese}}'}, {'{{chequePayee}}'}, {'{{bankLines}}'}, {'{{dueDate}}'}, {'{{amount}}'}.
        </p>
      )}

      {showHeader && (
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
      )}

      {showNotes && (
        <>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Payment instructions 付款指示</span>
            <textarea
              ref={(el) => onRegisterTextarea?.('paymentInstructions', el)}
              rows={12}
              value={draft.paymentInstructions}
              disabled={readOnly}
              onFocus={() => onFocusField?.('paymentInstructions')}
              onChange={(e) => onChange({ ...draft, paymentInstructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-sans leading-relaxed disabled:opacity-50"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Footer remark 底部備註</span>
            <textarea
              ref={(el) => onRegisterTextarea?.('footerRemark', el)}
              rows={3}
              value={draft.footerRemark}
              disabled={readOnly}
              onFocus={() => onFocusField?.('footerRemark')}
              onChange={(e) => onChange({ ...draft, footerRemark: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            />
          </label>
        </>
      )}

      {showActions && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => downloadDebitNoteNotesTemplate(downloadKey, downloadTemplate, 'doc')}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
          >
            Download doc 下載範本
          </button>
          <button
            type="button"
            onClick={() => downloadDebitNoteNotesTemplate(downloadKey, downloadTemplate, 'html')}
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
      )}
    </div>
  );

  if (embedded) {
    return <div className={className}>{formBody}</div>;
  }

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
      {open && formBody}
    </section>
  );
}

async function fetchNotesDraft(variant: TemplateCompanyVariantId): Promise<NotesDraft> {
  const res = await fetch('/api/rental-templates');
  if (!res.ok) return defaultDraft(variant);
  const data = await res.json();
  const tpl = data?.templates?.find((t: RentalDocumentTemplate) => t.templateKey === variant);
  return tpl ? draftFromTemplate(variant, tpl) : defaultDraft(variant);
}

/** Load saved debit note notes template for one company variant. */
export function useDebitNoteNotesTemplate(variant: TemplateCompanyVariantId, readOnly?: boolean) {
  const [draft, setDraft] = useState<NotesDraft>(() => defaultDraft(variant));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchNotesDraft(variant)
      .then((next) => {
        if (!cancelled) setDraft(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMessage('');
    const payload = {
      paymentInstructions: draft.paymentInstructions,
      footerRemark: draft.footerRemark,
      company: normalizeCompany(variant, draft.company),
    };
    const res = await fetch(`/api/rental-templates/${encodeURIComponent(variant)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSaveMessage(data.error || 'Save failed');
      return;
    }
    const refreshed = data.template
      ? draftFromTemplate(variant, data.template as RentalDocumentTemplate)
      : await fetchNotesDraft(variant);
    setDraft(refreshed);
    setSaveMessage('Template saved ✓');
    setTimeout(() => setSaveMessage(''), 3000);
  }, [readOnly, draft, variant]);

  return { draft, setDraft, loading, saving, saveMessage, save };
}
