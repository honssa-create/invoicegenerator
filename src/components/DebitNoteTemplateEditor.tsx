'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEBIT_NOTE_STYLE_FIELDS,
  DEFAULT_DEBIT_NOTE_STYLE,
  normalizeDebitNoteStyle,
  type DebitNoteStyleTemplate,
} from '@/lib/debit-note-style';

interface Props {
  style: DebitNoteStyleTemplate;
  onChange: (style: DebitNoteStyleTemplate) => void;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
  saving?: boolean;
  saveMessage?: string;
  className?: string;
}

export default function DebitNoteTemplateEditor({
  style,
  onChange,
  onSave,
  readOnly,
  saving,
  saveMessage,
  className = '',
}: Props) {
  const [open, setOpen] = useState(true);

  const setField = useCallback(
    (key: keyof DebitNoteStyleTemplate, value: string) => {
      onChange({ ...style, [key]: value });
    },
    [onChange, style],
  );

  const reset = () => onChange({ ...DEFAULT_DEBIT_NOTE_STYLE });

  return (
    <section className={`border border-gray-200 rounded-xl bg-white overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50 hover:bg-gray-100/80"
      >
        <span className="font-semibold text-gray-900">Template 樣式範本</span>
        <span className="text-gray-400 text-sm">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Edit colours, fonts, and spacing — preview updates instantly. Save to apply on all future debit notes.
            編輯字體與顏色，即時預覽；儲存後套用至所有繳費通知單。
          </p>

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

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Load saved debit note style template for the current user. */
export function useDebitNoteStyleTemplate(readOnly?: boolean) {
  const [style, setStyle] = useState<DebitNoteStyleTemplate>({ ...DEFAULT_DEBIT_NOTE_STYLE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    fetch('/api/debit-note/template')
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d?.style) setStyle(normalizeDebitNoteStyle(d.style));
      })
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setSaveMessage('');
    const res = await fetch('/api/debit-note/template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style }),
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
  }, [readOnly, style]);

  return { style, setStyle, loading, saving, saveMessage, save };
}
