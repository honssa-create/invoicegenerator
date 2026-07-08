'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  DEFAULT_FOOTER_REMARK_TEMPLATE,
  DEFAULT_RENT_INVOICE_NOTE,
  type RentalDocumentTemplate,
} from '@/lib/rental-templates';
import type { DebitNoteCompanyProfile } from '@/lib/rentals';

const PLACEHOLDER_HELP = `Placeholders: {{noteNo}}, {{dueDateChinese}}, {{chequePayee}}, {{bankLines}}, {{manualRemark}}`;

const FOOTER_HELP = `Placeholders: {{dueDate}}, {{periodLabel}}, {{amount}}, {{chargeLabel}}, {{arrearRange}}`;

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

function emptyCompany(): Partial<DebitNoteCompanyProfile> {
  return { nameZh: '', nameEn: '', address: '', phone: '', taxId: '', chequePayee: '' };
}

export default function RentalTemplatesPage() {
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [templates, setTemplates] = useState<RentalDocumentTemplate[]>([]);
  const [selectedKey, setSelectedKey] = useState('label');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [name, setName] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [footerRemark, setFooterRemark] = useState(DEFAULT_FOOTER_REMARK_TEMPLATE);
  const [rentInvoiceNote, setRentInvoiceNote] = useState(DEFAULT_RENT_INVOICE_NOTE);
  const [company, setCompany] = useState<Partial<DebitNoteCompanyProfile>>(emptyCompany());

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/rental-templates')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: RentalDocumentTemplate[] = d?.templates || [];
        setTemplates(list);
        if (list.length && !list.some((t) => t.templateKey === selectedKey)) {
          setSelectedKey(list[0].templateKey);
        }
      })
      .finally(() => setLoading(false));
  }, [selectedKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const tpl = templates.find((t) => t.templateKey === selectedKey);
    if (!tpl) return;
    setName(tpl.name);
    setPaymentInstructions(tpl.paymentInstructions);
    setFooterRemark(tpl.footerRemark || DEFAULT_FOOTER_REMARK_TEMPLATE);
    setRentInvoiceNote(tpl.rentInvoiceNote || DEFAULT_RENT_INVOICE_NOTE);
    setCompany({ ...emptyCompany(), ...(tpl.company || {}) });
  }, [templates, selectedKey]);

  const save = async () => {
    setSaving(true);
    setToast('');
    const res = await fetch(`/api/rental-templates/${encodeURIComponent(selectedKey)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        paymentInstructions,
        footerRemark,
        rentInvoiceNote,
        company,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setToast('Failed to save template');
      return;
    }
    const data = await res.json();
    setTemplates((prev) => prev.map((t) => (t.templateKey === selectedKey ? data.template : t)));
    setToast('Template saved ✓');
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <Link href="/rentals" className="text-sm text-brand-600 font-medium">← Rentals</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Templates 範本</h1>
            <p className="text-sm text-gray-500 mt-1">
              Saved invoice, debit note, and payment instruction templates.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Template 範本</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.templateKey}
                    type="button"
                    onClick={() => setSelectedKey(t.templateKey)}
                    className={`px-3 py-2 rounded-lg text-sm border ${
                      selectedKey === t.templateKey
                        ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Display name</label>
              <input className={inp} value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company (ZH)</label>
                <input className={inp} value={company.nameZh || ''} onChange={(e) => setCompany({ ...company, nameZh: e.target.value })} disabled={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company (EN)</label>
                <input className={inp} value={company.nameEn || ''} onChange={(e) => setCompany({ ...company, nameEn: e.target.value })} disabled={readOnly} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input className={inp} value={company.address || ''} onChange={(e) => setCompany({ ...company, address: e.target.value })} disabled={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input className={inp} value={company.phone || ''} onChange={(e) => setCompany({ ...company, phone: e.target.value })} disabled={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tax ID</label>
                <input className={inp} value={company.taxId || ''} onChange={(e) => setCompany({ ...company, taxId: e.target.value })} disabled={readOnly} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Cheque payee</label>
                <input className={inp} value={company.chequePayee || ''} onChange={(e) => setCompany({ ...company, chequePayee: e.target.value })} disabled={readOnly} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Debit note payment instructions 繳費通知付款指示
              </label>
              <p className="text-xs text-gray-400 mb-2">{PLACEHOLDER_HELP}</p>
              <textarea
                rows={14}
                className={`${inp} font-sans leading-relaxed`}
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Debit note footer remark 底部備註
              </label>
              <p className="text-xs text-gray-400 mb-2">{FOOTER_HELP}</p>
              <textarea
                rows={3}
                className={inp}
                value={footerRemark}
                onChange={(e) => setFooterRemark(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Rent invoice note 租金單備註
              </label>
              <textarea
                rows={3}
                className={inp}
                value={rentInvoiceNote}
                onChange={(e) => setRentInvoiceNote(e.target.value)}
                disabled={readOnly}
              />
            </div>

            {!readOnly && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Template 儲存範本'}
                </button>
              </div>
            )}
            {toast && <p className="text-sm text-brand-700">{toast}</p>}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
