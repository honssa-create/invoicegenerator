'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDebitNoteStyleTemplate } from '@/components/DebitNoteTemplateEditor';
import FormalDebitNoteDocument from '@/components/FormalDebitNoteDocument';
import {
  DEBIT_NOTE_COMPANY_VARIANTS,
  isTemplateCompanyVariantId,
  paymentTemplateIdForVariant,
  variantToCompanyIds,
  type TemplateCompanyVariantId,
} from '@/lib/document-templates';
import type { RentalDocumentTemplate } from '@/lib/rental-templates';
import {
  buildDebitNotePaymentInstructionsText,
  currentBillingPeriod,
  formatDueDateChinese,
  renderDebitNoteFooterRemark,
  resolveDebitNoteCompanyHeader,
  type DebitNoteMode,
  type FormalDebitNote,
} from '@/lib/rentals';
import { BTN, bi } from '@/lib/ui-labels';

const TEMPLATE_STORAGE_KEY = 'debit-note-preview-template';

const TEMPLATE_OPTIONS = DEBIT_NOTE_COMPANY_VARIANTS.map((v) => ({
  id: v.id,
  label: v.shortLabel,
}));

function loadStoredTemplate(): TemplateCompanyVariantId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    return raw && isTemplateCompanyVariantId(raw) ? raw : null;
  } catch {
    return null;
  }
}

function DebitNoteContent() {
  const searchParams = useSearchParams();
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
  const initialTemplateRaw = searchParams.get('paymentTemplate') || searchParams.get('payment_template');
  const urlTemplate = initialTemplateRaw && isTemplateCompanyVariantId(initialTemplateRaw)
    ? initialTemplateRaw
    : null;

  const [templateVariant, setTemplateVariant] = useState<TemplateCompanyVariantId>(
    urlTemplate || 'label',
  );
  const { style } = useDebitNoteStyleTemplate(templateVariant);
  const [notesByKey, setNotesByKey] = useState<Partial<Record<TemplateCompanyVariantId, RentalDocumentTemplate>>>({});

  const [doc, setDoc] = useState<FormalDebitNote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendToast, setSendToast] = useState('');

  useEffect(() => {
    if (urlTemplate) {
      setTemplateVariant(urlTemplate);
      return;
    }
    const stored = loadStoredTemplate();
    if (stored) setTemplateVariant(stored);
  }, [urlTemplate]);

  const setTemplatePersist = (id: TemplateCompanyVariantId) => {
    setTemplateVariant(id);
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetch('/api/rental-templates')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const next: Partial<Record<TemplateCompanyVariantId, RentalDocumentTemplate>> = {};
        for (const t of (d?.templates || []) as RentalDocumentTemplate[]) {
          if (isTemplateCompanyVariantId(t.templateKey)) next[t.templateKey] = t;
        }
        setNotesByKey(next);
      })
      .catch(() => {});
  }, []);

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
          if (!urlTemplate && !loadStoredTemplate() && (d.paymentTemplateId === 'label' || d.paymentTemplateId === 'elite')) {
            setTemplateVariant(d.paymentTemplateId);
          }
        } else {
          setError('Debit note not available');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tenantId, unitId, unitIds, targetPeriod, mode, paidLookback, from, urlTemplate]);

  const displayDoc = useMemo(() => {
    if (!doc) return null;
    const notes = notesByKey[templateVariant];
    const companyIds = variantToCompanyIds(templateVariant);
    const resolved = resolveDebitNoteCompanyHeader(companyIds);
    const companyOverride = notes?.company || null;
    const company = {
      ...resolved,
      ...(companyOverride
        ? {
            nameZh: companyOverride.nameZh?.trim() || resolved.nameZh,
            nameEn: companyOverride.nameEn?.trim() || resolved.nameEn,
            address: companyOverride.address?.trim() || resolved.address,
            phone: companyOverride.phone?.trim() || resolved.phone,
            taxId: companyOverride.taxId?.trim() || resolved.taxId,
            chequePayee: companyOverride.chequePayee?.trim() || resolved.chequePayee,
          }
        : {}),
    };
    const dueDateChinese = formatDueDateChinese(doc.dueDateDisplay, doc.targetPeriod.split('-')[0]);
    const paymentInstructionsText = buildDebitNotePaymentInstructionsText(
      paymentTemplateIdForVariant(templateVariant),
      doc.noteNo,
      dueDateChinese,
      null,
      notes?.paymentInstructions,
      companyOverride,
    );
    const footerRemark = renderDebitNoteFooterRemark(
      notes?.footerRemark,
      doc.targetPeriod,
      doc.dueDateDisplay,
      doc.arrearRows.map((r) => r.period),
      doc.grandTotal,
    );
    return {
      ...doc,
      company,
      companyIds,
      paymentTemplateId: paymentTemplateIdForVariant(templateVariant),
      paymentInstructionsText,
      paymentInstructions: paymentInstructionsText.split('\n').filter((l) => l !== ''),
      footerRemark,
    };
  }, [doc, notesByKey, templateVariant]);

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
        paymentTemplate: displayDoc.paymentTemplateId,
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
    <div className="debit-note-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={unitId ? `/rentals/${unitId}` : `/rentals/tenants/${tenantId}`}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium print:hidden"
        >
          ← {BTN.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
            role="group"
            aria-label={bi('Debit note template', '繳費通知單範本')}
          >
            {TEMPLATE_OPTIONS.map((opt) => {
              const active = templateVariant === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTemplatePersist(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    active
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={sendDebitNote}
            disabled={sending}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send Debit Note 發送'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 print:hidden"
          >
            {BTN.printPdf}
          </button>
        </div>
      </div>

      {sendToast ? (
        <p className="no-print px-6 py-2 text-sm text-brand-700 bg-white border-b border-gray-200">{sendToast}</p>
      ) : null}

      <div className="py-8 print:py-0">
        <FormalDebitNoteDocument doc={displayDoc} styleTemplate={style} printMode />
      </div>
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
