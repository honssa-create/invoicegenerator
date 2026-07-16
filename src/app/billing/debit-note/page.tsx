'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DebitNotePaymentOptions from '@/components/DebitNotePaymentOptions';
import DebitNoteTemplateEditor, { useDebitNoteStyleTemplate } from '@/components/DebitNoteTemplateEditor';
import FormalDebitNoteDocument from '@/components/FormalDebitNoteDocument';
import { useAuth } from '@/components/AuthProvider';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  currentBillingPeriod,
  formatDueDateChinese,
  type DebitNoteMode,
  type DebitNotePaymentTemplateId,
  type FormalDebitNote,
} from '@/lib/rentals';
import { BTN, NAV, bi } from '@/lib/ui-labels';

function DebitNoteContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [paymentTemplate, setPaymentTemplate] = useState<DebitNotePaymentTemplateId>('label');
  const { style, setStyle, saving: savingStyle, saveMessage, save: saveStyle } = useDebitNoteStyleTemplate(paymentTemplate, readOnly);
  const tenantId = searchParams.get('tenantId') || searchParams.get('tenant_id');
  const unitId = searchParams.get('unitId') || searchParams.get('unit_id');
  const unitIds = searchParams.get('unitIds') || searchParams.get('unit_ids');
  const targetPeriod =
    searchParams.get('targetPeriod') ||
    searchParams.get('target_period') ||
    searchParams.get('period') ||
    currentBillingPeriod();
  const mode = (searchParams.get('mode') || 'grouped') as DebitNoteMode;
  const paidLookback = searchParams.get('paid_lookback') || '2';
  const from = searchParams.get('from') || '';
  const initialTemplate = searchParams.get('paymentTemplate') || searchParams.get('payment_template');

  const [doc, setDoc] = useState<FormalDebitNote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentInstructionsText, setPaymentInstructionsText] = useState('');
  const [footerRemark, setFooterRemark] = useState('');
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendToast, setSendToast] = useState('');

  useEffect(() => {
    if (!tenantId) {
      setError('tenantId is required');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({
      tenantId,
      targetPeriod,
      mode,
      paid_lookback: paidLookback,
      format: 'formal',
    });
    if (unitId) qs.set('unitId', unitId);
    if (unitIds) qs.set('unitIds', unitIds);
    if (from) qs.set('from', from);

    fetch(`/api/debit-note?${qs}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load debit note');
        return data;
      })
      .then((d) => {
        if (d?.tenant) {
          setDoc(d);
          if (initialTemplate === 'label' || initialTemplate === 'elite') {
            setPaymentTemplate(initialTemplate);
          } else {
            setPaymentTemplate(d.paymentTemplateId || 'label');
          }
          setPaymentInstructionsText(d.paymentInstructionsText || '');
          setFooterRemark(d.footerRemark || '');
        } else {
          setError('Debit note not available');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tenantId, unitId, unitIds, targetPeriod, mode, paidLookback, from, initialTemplate]);

  const dueDateChinese = useMemo(() => {
    if (!doc) return 'yyyy年mm月dd日';
    return formatDueDateChinese(doc.dueDateDisplay, doc.targetPeriod.split('-')[0]);
  }, [doc]);

  const displayDoc = useMemo(() => {
    if (!doc) return null;
    const instructions = paymentInstructionsText || doc.paymentInstructionsText;
    return {
      ...doc,
      paymentTemplateId: paymentTemplate,
      paymentInstructionsText: instructions,
      paymentInstructions: instructions.split('\n').filter((l) => l !== ''),
      footerRemark: footerRemark || doc.footerRemark,
    };
  }, [doc, paymentTemplate, paymentInstructionsText, footerRemark]);

  const sendDebitNote = async () => {
    if (!tenantId || !doc || !displayDoc) return;
    setSending(true);
    setSendToast('');
    const res = await fetch('/api/debit-note/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: Number(tenantId),
        targetPeriod,
        mode,
        unitId: unitId ? Number(unitId) : undefined,
        unitIds,
        fromPeriod: from || undefined,
        paidLookbackMonths: Number(paidLookback) || 2,
        paymentTemplate,
        paymentInstructionsText: displayDoc.paymentInstructionsText,
        footerRemark: displayDoc.footerRemark,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setSendToast(data.error || 'Failed to send');
      return;
    }
    setSendToast(data.sent ? 'Debit note sent by email ✓' : 'Logged (no email provider configured)');
  };

  const saveTemplate = async () => {
    if (!displayDoc) return;
    setSavingTemplate(true);
    setSendToast('');
    const res = await fetch(`/api/rental-templates/${encodeURIComponent(paymentTemplate)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentInstructions: displayDoc.paymentInstructionsText,
        footerRemark: displayDoc.footerRemark,
      }),
    });
    setSavingTemplate(false);
    setSendToast(res.ok ? 'Template saved to Templates section ✓' : 'Failed to save template');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{BTN.loading}</div>;
  }

  if (error || !doc || !displayDoc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500 px-6 text-center">
        <p>{error || 'Debit note unavailable'}</p>
        <Link href="/rentals" className="text-brand-600 text-sm font-medium">← {bi('Back to Rentals', '返回租金管理')}</Link>
      </div>
    );
  }

  return (
    <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-between items-start gap-4">
          <Link href={unitId ? `/rentals/${unitId}` : `/rentals/tenants/${tenantId}`} className="text-sm text-brand-600 font-medium">
            ← {BTN.back}
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/rentals/templates"
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Templates 範本
            </Link>
            <button
              type="button"
              onClick={saveTemplate}
              disabled={savingTemplate}
              className="px-4 py-2 border border-brand-300 text-brand-700 text-sm rounded-lg hover:bg-brand-50 disabled:opacity-50"
            >
              {savingTemplate ? BTN.saving : bi('Save Template', '儲存範本')}
            </button>
            <button
              type="button"
              onClick={sendDebitNote}
              disabled={sending}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send Debit Note 發送'}
            </button>
            <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">
              {BTN.printSavePdf}
            </button>
          </div>
        </div>
        {sendToast && <p className="max-w-5xl mx-auto mt-2 text-sm text-brand-700">{sendToast}</p>}
        <div className="max-w-5xl mx-auto mt-4 space-y-4">
          <DebitNotePaymentOptions
            templateId={paymentTemplate}
            onTemplateId={setPaymentTemplate}
            noteNo={doc.noteNo}
            dueDateChinese={dueDateChinese}
            instructionsText={paymentInstructionsText}
            onInstructionsText={setPaymentInstructionsText}
            footerRemark={footerRemark}
            onFooterRemark={setFooterRemark}
          />
          <DebitNoteTemplateEditor
            companyKey={paymentTemplate}
            style={style}
            onChange={setStyle}
            onSave={saveStyle}
            readOnly={readOnly}
            saving={savingStyle}
            saveMessage={saveMessage}
          />
        </div>
      </div>

      <main
        className="a4-page my-8 shadow print:shadow-none print:my-0"
        style={{ padding: style.pagePadding }}
      >
        <FormalDebitNoteDocument doc={displayDoc} styleTemplate={style} />
      </main>
    </div>
  );
}

export default function BillingDebitNotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">{BTN.loading}</div>}>
      <DebitNoteContent />
    </Suspense>
  );
}
