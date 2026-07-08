'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DebitNoteNotesTemplateEditor, {
  type NotesDraft,
  useDebitNoteNotesTemplate,
} from '@/components/DebitNoteNotesTemplateEditor';
import DebitNoteTemplateEditor, { useDebitNoteStyleTemplate } from '@/components/DebitNoteTemplateEditor';
import FormalDebitNoteDocument from '@/components/FormalDebitNoteDocument';
import { useAuth } from '@/components/AuthProvider';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  DEBIT_NOTE_COMPANY_CHOICES,
  buildDebitNotePaymentInstructionsText,
  renderDebitNoteFooterRemark,
  resolveDebitNoteCompanyHeader,
  type DebitNoteCompanyId,
  type FormalDebitNote,
} from '@/lib/rentals';

function buildNotesPreviewDoc(companyKey: DebitNoteCompanyId, draft: NotesDraft): FormalDebitNote {
  const unitName = companyKey === 'label' ? '204' : '213A';
  const header = resolveDebitNoteCompanyHeader([companyKey]);
  const company = {
    ...header,
    nameZh: draft.company.nameZh?.trim() || header.nameZh,
    nameEn: draft.company.nameEn?.trim() || header.nameEn,
    address: draft.company.address?.trim() || '',
    phone: draft.company.phone?.trim() || '',
    taxId: draft.company.taxId?.trim() || '',
    chequePayee: draft.company.chequePayee?.trim() || header.chequePayee,
  };
  const paymentInstructionsText = buildDebitNotePaymentInstructionsText(
    companyKey,
    'DN-202607-0001',
    '2026年7月15日',
    null,
    draft.paymentInstructions,
    draft.company,
  );
  const footerRemark = renderDebitNoteFooterRemark(
    draft.footerRemark,
    '2026-07',
    '15/07/2026',
    [],
    1500,
  );
  return {
    noteNo: 'DN-202607-0001',
    issuedDate: '2026-07-08',
    issuedDateDisplay: '08/07/2026',
    dueDate: '2026-07-15',
    dueDateDisplay: '15/07/2026',
    tenant: {
      id: 0,
      user_id: 0,
      name: 'Tenant',
      phone: '',
      email: '',
      notes: '',
      utilityBillingMode: 'company_proxy',
      created_at: '',
      updated_at: '',
    },
    premises: unitName,
    targetPeriod: '2026-07',
    targetPeriodLabel: '07/2026',
    company,
    currentCharges: [],
    currentSubtotal: 0,
    arrearRows: [],
    settledPeriodsNote: null,
    totalArrears: 0,
    grandTotal: 1500,
    footerRemark,
    paymentInstructions: paymentInstructionsText.split('\n').filter((l) => l !== ''),
    paymentInstructionsText,
    paymentTemplateId: companyKey,
    companyIds: [companyKey],
    units: [{ id: 0, unitName, utilityBillingMode: 'company_proxy', billingCompany: companyKey }],
  };
}

function CompanyTabs({
  value,
  onChange,
}: {
  value: DebitNoteCompanyId;
  onChange: (id: DebitNoteCompanyId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEBIT_NOTE_COMPANY_CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === c.id
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function LayoutSection({
  companyKey,
  readOnly,
}: {
  companyKey: DebitNoteCompanyId;
  readOnly: boolean;
}) {
  const { style, setStyle, loading, saving, saveMessage, save } = useDebitNoteStyleTemplate(companyKey, readOnly);
  const { draft: notesDraft, loading: notesLoading } = useDebitNoteNotesTemplate(companyKey, true);
  const sampleDoc = useMemo(() => {
    if (notesLoading) return buildNotesPreviewDoc(companyKey, { paymentInstructions: '', footerRemark: '', company: {} });
    return buildNotesPreviewDoc(companyKey, notesDraft);
  }, [companyKey, notesDraft, notesLoading]);

  if (loading) {
    return <p className="text-sm text-gray-400 py-4">Loading layout template…</p>;
  }

  return (
    <>
      <DebitNoteTemplateEditor
        companyKey={companyKey}
        style={style}
        onChange={setStyle}
        onSave={save}
        readOnly={readOnly}
        saving={saving}
        saveMessage={saveMessage}
      />
      <div className="mt-6">
        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Preview 預覽</p>
        <main
          className="a4-page mx-auto shadow print:shadow-none"
          style={{ padding: style.pagePadding }}
        >
          <FormalDebitNoteDocument doc={sampleDoc} styleTemplate={style} />
        </main>
      </div>
    </>
  );
}

function NotesSection({
  companyKey,
  readOnly,
}: {
  companyKey: DebitNoteCompanyId;
  readOnly: boolean;
}) {
  const { draft, setDraft, loading, saving, saveMessage, save } = useDebitNoteNotesTemplate(companyKey, readOnly);
  const { style, loading: styleLoading } = useDebitNoteStyleTemplate(companyKey, true);
  const previewDoc = useMemo(() => buildNotesPreviewDoc(companyKey, draft), [companyKey, draft]);

  if (loading) {
    return <p className="text-sm text-gray-400 py-4">Loading notes template…</p>;
  }

  return (
    <>
      <DebitNoteNotesTemplateEditor
        companyKey={companyKey}
        draft={draft}
        onChange={setDraft}
        onSave={save}
        readOnly={readOnly}
        saving={saving}
        saveMessage={saveMessage}
      />
      <div className="mt-6">
        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Preview 預覽</p>
        {styleLoading ? (
          <p className="text-sm text-gray-400 py-4">Loading preview…</p>
        ) : (
          <main
            className="a4-page mx-auto shadow print:shadow-none"
            style={{ padding: style.pagePadding }}
          >
            <FormalDebitNoteDocument doc={previewDoc} styleTemplate={style} />
          </main>
        )}
      </div>
    </>
  );
}

export default function RentalTemplatesPage() {
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [layoutCompany, setLayoutCompany] = useState<DebitNoteCompanyId>('label');
  const [notesCompany, setNotesCompany] = useState<DebitNoteCompanyId>('label');

  return (
    <AppLayout>
      <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
        <div className="no-print px-6 py-4">
          <div className="max-w-5xl mx-auto space-y-8">
            <div>
              <Link href="/rentals" className="text-sm text-brand-600 font-medium">← Back to Rentals</Link>
              <h1 className="text-xl font-bold text-gray-900 mt-2">Debit Note Templates 繳費通知單範本</h1>
              <p className="text-sm text-gray-500 mt-1">
                Separate layout and payment-notes templates for Honour Label and Honour Elite.
                Preview online or download as Word-compatible .doc files.
                可線上調整樣式，或下載範本文件離線編輯。
              </p>
            </div>

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">1. Layout 樣式</h2>
                <p className="text-sm text-gray-500">Fonts, colours, and spacing on the debit note document.</p>
              </div>
              <CompanyTabs value={layoutCompany} onChange={setLayoutCompany} />
              <LayoutSection key={`layout-${layoutCompany}`} companyKey={layoutCompany} readOnly={readOnly} />
            </section>

            <section className="space-y-4 pb-8">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">2. Notes 付款備註</h2>
                <p className="text-sm text-gray-500">
                  Company header, payment instructions, and footer remark — linked to units via billing company on the unit profile.
                </p>
              </div>
              <CompanyTabs value={notesCompany} onChange={setNotesCompany} />
              <NotesSection key={`notes-${notesCompany}`} companyKey={notesCompany} readOnly={readOnly} />
            </section>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
