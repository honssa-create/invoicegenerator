'use client';

import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import DebitNoteTemplateEditor, { useDebitNoteStyleTemplate } from '@/components/DebitNoteTemplateEditor';
import FormalDebitNoteDocument from '@/components/FormalDebitNoteDocument';
import { useAuth } from '@/components/AuthProvider';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  buildDebitNotePaymentInstructionsText,
  resolveDebitNoteCompanyHeader,
  type FormalDebitNote,
} from '@/lib/rentals';

const SAMPLE_DOC: FormalDebitNote = {
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
  premises: '213A',
  targetPeriod: '2026-07',
  targetPeriodLabel: '07/2026',
  company: resolveDebitNoteCompanyHeader(['elite']),
  currentCharges: [],
  currentSubtotal: 0,
  arrearRows: [],
  settledPeriodsNote: null,
  totalArrears: 0,
  grandTotal: 0,
  footerRemark: '',
  paymentInstructions: [],
  paymentInstructionsText: buildDebitNotePaymentInstructionsText(
    'elite',
    'DN-202607-0001',
    '2026年7月15日',
  ),
  paymentTemplateId: 'elite',
  companyIds: ['elite'],
  units: [{ id: 0, unitName: '213A', utilityBillingMode: 'company_proxy' }],
};

export default function RentalTemplatesPage() {
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const { style, setStyle, saving, saveMessage, save } = useDebitNoteStyleTemplate(readOnly);

  return (
    <AppLayout>
      <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
        <div className="no-print bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto">
            <Link href="/rentals" className="text-sm text-brand-600 font-medium">← Back to Rentals</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-2">Debit Note Template 繳費通知單樣式</h1>
            <p className="text-sm text-gray-500 mt-1">
              Customise fonts, colours, and spacing. Saved styles apply to all debit notes.
            </p>
            <div className="mt-4">
              <DebitNoteTemplateEditor
                style={style}
                onChange={setStyle}
                onSave={save}
                readOnly={readOnly}
                saving={saving}
                saveMessage={saveMessage}
              />
            </div>
          </div>
        </div>

        <main
          className="a4-page my-8 mx-auto shadow print:shadow-none print:my-0"
          style={{ padding: style.pagePadding }}
        >
          <FormalDebitNoteDocument doc={SAMPLE_DOC} styleTemplate={style} />
        </main>
      </div>
    </AppLayout>
  );
}
