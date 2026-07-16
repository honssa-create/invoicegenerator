'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import DebitNoteNotesTemplateEditor, {
  useDebitNoteNotesTemplate,
} from '@/components/DebitNoteNotesTemplateEditor';
import DebitNoteTemplateEditor, { useDebitNoteStyleTemplate } from '@/components/DebitNoteTemplateEditor';
import FormalDebitNoteDocument from '@/components/FormalDebitNoteDocument';
import DocumentTemplateShell from '@/components/document-templates/DocumentTemplateShell';
import TemplateVariablePanel from '@/components/document-templates/TemplateVariablePanel';
import {
  buildDebitNotePreviewDocument,
  DEBIT_NOTE_COMPANY_VARIANTS,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';
import { BTN, MSG, bi } from '@/lib/ui-labels';

interface EditorSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

function EditorSection({ title, description, children, actions }: EditorSectionProps) {
  const [open, setOpen] = useState(true);
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
      {open && (
        <div className="p-3 border-t border-gray-100 space-y-3">
          {children}
          {actions && <div className="pt-1 border-t border-gray-100">{actions}</div>}
        </div>
      )}
    </section>
  );
}

interface Props {
  variant: TemplateCompanyVariantId;
  readOnly?: boolean;
}

export default function DebitNoteTemplateWorkspace({ variant, readOnly }: Props) {
  const {
    style,
    setStyle,
    loading: styleLoading,
    saving: styleSaving,
    saveMessage: styleSaveMessage,
    save: saveStyle,
  } = useDebitNoteStyleTemplate(variant, readOnly);
  const {
    draft,
    setDraft,
    loading: notesLoading,
    saving: notesSaving,
    saveMessage: notesSaveMessage,
    save: saveNotes,
  } = useDebitNoteNotesTemplate(variant, readOnly);

  const textareasRef = useRef<Record<'paymentInstructions' | 'footerRemark', HTMLTextAreaElement | null>>({
    paymentInstructions: null,
    footerRemark: null,
  });
  const [activeField, setActiveField] = useState<'paymentInstructions' | 'footerRemark'>('paymentInstructions');

  const registerTextarea = useCallback(
    (key: 'paymentInstructions' | 'footerRemark', el: HTMLTextAreaElement | null) => {
      textareasRef.current[key] = el;
    },
    [],
  );

  const insertVariable = useCallback(
    (token: string) => {
      const key = activeField;
      const el = textareasRef.current[key];
      const current = draft[key];
      if (el) {
        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? start;
        const next = current.slice(0, start) + token + current.slice(end);
        setDraft({ ...draft, [key]: next });
        requestAnimationFrame(() => {
          el.focus();
          const pos = start + token.length;
          el.setSelectionRange(pos, pos);
        });
        return;
      }
      setDraft({ ...draft, [key]: current + token });
    },
    [activeField, draft, setDraft],
  );

  const previewDoc = useMemo(
    () => buildDebitNotePreviewDocument(variant, draft, style),
    [variant, draft, style],
  );

  const variantLabel = DEBIT_NOTE_COMPANY_VARIANTS.find((v) => v.id === variant)?.shortLabel ?? variant;
  const loading = styleLoading || notesLoading;

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Loading template for {variantLabel}…
      </div>
    );
  }

  const layoutActions = !readOnly ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void saveStyle()}
        disabled={styleSaving}
        className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg disabled:opacity-50"
      >
        {styleSaving ? BTN.saving : bi('Save layout', '儲存樣式')}
      </button>
      {styleSaveMessage && <span className="text-sm text-brand-700">{styleSaveMessage}</span>}
    </div>
  ) : null;

  const notesActions = !readOnly ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void saveNotes()}
        disabled={notesSaving}
        className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg disabled:opacity-50"
      >
        {notesSaving ? BTN.saving : bi('Save header & notes', '儲存頁首與備註')}
      </button>
      {notesSaveMessage && <span className="text-sm text-brand-700">{notesSaveMessage}</span>}
    </div>
  ) : null;

  return (
    <DocumentTemplateShell
      editor={
        <>
          <EditorSection
            title="Layout 樣式"
            description="Fonts, colours, spacing · 字體與間距"
            actions={layoutActions}
          >
            <DebitNoteTemplateEditor
              companyKey={variant}
              style={style}
              onChange={setStyle}
              readOnly={readOnly}
              embedded
              hideActions
            />
          </EditorSection>

          <EditorSection
            title="Header 頁首"
            description="Company name, address, tax ID · 公司資料"
          >
            <DebitNoteNotesTemplateEditor
              companyKey={variant}
              draft={draft}
              onChange={setDraft}
              readOnly={readOnly}
              embedded
              section="header"
            />
          </EditorSection>

          <EditorSection
            title="Notes & Payment 付款備註"
            description="Bank details and footer remark · 付款指示與底部備註"
            actions={notesActions}
          >
            <TemplateVariablePanel onInsert={insertVariable} />
            <DebitNoteNotesTemplateEditor
              companyKey={variant}
              draft={draft}
              onChange={setDraft}
              readOnly={readOnly}
              embedded
              section="notes"
              onRegisterTextarea={registerTextarea}
              onFocusField={setActiveField}
            />
            <div className="flex gap-3 text-xs text-gray-500">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`active-field-${variant}`}
                  checked={activeField === 'paymentInstructions'}
                  onChange={() => setActiveField('paymentInstructions')}
                />
                Insert into payment instructions
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`active-field-${variant}`}
                  checked={activeField === 'footerRemark'}
                  onChange={() => setActiveField('footerRemark')}
                />
                Insert into footer remark
              </label>
            </div>
          </EditorSection>
        </>
      }
      preview={
        <main
          className="a4-page mx-auto shadow-lg print:shadow-none origin-top scale-[0.85] sm:scale-90 xl:scale-100"
          style={{ padding: style.pagePadding }}
        >
          <FormalDebitNoteDocument doc={previewDoc} styleTemplate={style} />
        </main>
      }
    />
  );
}
