'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEBIT_NOTE_STYLE_FIELDS,
  DEFAULT_DEBIT_NOTE_STYLE,
  normalizeDebitNoteStyle,
  type DebitNoteStyleTemplate,
} from '@/lib/debit-note-style';
import { downloadDebitNoteStyleTemplate } from '@/lib/debit-note-style-document';
import { DEBIT_NOTE_COMPANY_VARIANTS, type TemplateCompanyVariantId } from '@/lib/document-templates';

interface Props {
  companyKey: TemplateCompanyVariantId;
  style: DebitNoteStyleTemplate;
  onChange: (style: DebitNoteStyleTemplate) => void;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
  saving?: boolean;
  saveMessage?: string;
  className?: string;
  /** Inline form without collapsible chrome (split-screen editor). */
  embedded?: boolean;
  /** Hide download / save / reset row (parent provides actions). */
  hideActions?: boolean;
}

export default function DebitNoteTemplateEditor({
  companyKey,
  style,
  onChange,
  onSave,
  readOnly,
  saving,
  saveMessage,
  className = '',
  embedded = false,
  hideActions = false,
}: Props) {
  const [open, setOpen] = useState(true);
  const companyLabel = DEBIT_NOTE_COMPANY_VARIANTS.find((c) => c.id === companyKey)?.shortLabel ?? companyKey;

  const setField = useCallback(
    (key: keyof DebitNoteStyleTemplate, value: string) => {
      onChange({ ...style, [key]: value });
    },
    [onChange, style],
  );

  const reset = () => onChange({ ...DEFAULT_DEBIT_NOTE_STYLE });

  const formBody = (
        <div className={embedded ? 'space-y-4' : 'p-4 space-y-4 border-t border-gray-100'}>
          {!embedded && (
          <p className="text-xs text-gray-500">
            Edit colours, fonts, and spacing — preview updates instantly. Save applies to debit notes for this company.
            編輯字體與顏色，即時預覽；儲存後套用至該公司的繳費通知單。
          </p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {DEBIT_NOTE_STYLE_FIELDS.map((field) => {
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
                        value={value.startsWith('#') ? value : '#111827'}
                        disabled={readOnly}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className="h-9 w-12 rounded border border-gray-200 cursor-pointer disabled:opacity-50"
                      />
                      <input
                        type="text"
                        value={value}
                        disabled={readOnly}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={value}
                      disabled={readOnly}
                      placeholder={field.placeholder}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
                    />
                  )}
                </label>
              );
            })}
          </div>

          {!hideActions && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => downloadDebitNoteStyleTemplate(style, companyKey === 'joint' ? 'label' : companyKey, 'doc')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Download doc 下載範本
            </button>
            <button
              type="button"
              onClick={() => downloadDebitNoteStyleTemplate(style, companyKey === 'joint' ? 'label' : companyKey, 'html')}
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
        <span className="font-semibold text-gray-900">Layout 樣式 — {companyLabel}</span>
        <span className="text-gray-400 text-sm">{open ? '▼' : '▶'}</span>
      </button>
      {open && formBody}
    </section>
  );
}

/** Load saved debit note style template for one billing company variant. */
export function useDebitNoteStyleTemplate(companyKey: TemplateCompanyVariantId, readOnly?: boolean) {
  const [style, setStyle] = useState<DebitNoteStyleTemplate>({ ...DEFAULT_DEBIT_NOTE_STYLE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/debit-note/template?company=${companyKey}`)
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d?.style) setStyle(normalizeDebitNoteStyle(d.style));
        else setStyle({ ...DEFAULT_DEBIT_NOTE_STYLE });
      })
      .finally(() => setLoading(false));
  }, [companyKey]);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMessage('');
    const res = await fetch('/api/debit-note/template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: companyKey, style }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSaveMessage(data.error || 'Save failed');
      return;
    }
    if (data.style) setStyle(normalizeDebitNoteStyle(data.style));
    setSaveMessage('Template saved ✓');
    setTimeout(() => setSaveMessage(''), 3000);
  }, [readOnly, style, companyKey]);

  return { style, setStyle, loading, saving, saveMessage, save };
}
