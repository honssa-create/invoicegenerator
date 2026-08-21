'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ReminderCandidate, ReminderType } from '@/lib/payment-reminders';
import { bi } from '@/lib/ui-labels';

const hintCls = 'text-[11px] text-gray-400 mt-0.5';

type FilterTab = 'all' | ReminderType;

function candidateKey(c: Pick<ReminderCandidate, 'id' | 'type'>) {
  return `${c.id}:${c.type}`;
}

function typeLabel(type: ReminderType) {
  return type === 'due_soon'
    ? bi('Due soon', '即將到期')
    : bi('Overdue', '已逾期');
}

function typeBadgeClass(type: ReminderType) {
  return type === 'due_soon'
    ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-700';
}

export default function InvoiceRemindersPage() {
  const { isSectionReadOnly } = useAuth();
  const readOnly = isSectionReadOnly('invoices');
  const [overdueDays, setOverdueDays] = useState(30);
  const [dueSoonDays, setDueSoonDays] = useState(7);
  const [candidates, setCandidates] = useState<ReminderCandidate[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/invoices/reminders')
      .then((r) => r.json())
      .then((d) => {
        const list: ReminderCandidate[] = d.candidates || [];
        setOverdueDays(d.overdueDays || d.days || 30);
        setDueSoonDays(d.dueSoonDays || 7);
        setCandidates(list);
        setSelectedKey((prev) => {
          if (prev && list.some((c) => candidateKey(c) === prev)) return prev;
          return list[0] ? candidateKey(list[0]) : null;
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return candidates;
    return candidates.filter((c) => c.type === filter);
  }, [candidates, filter]);

  useEffect(() => {
    if (selectedKey && filtered.some((c) => candidateKey(c) === selectedKey)) return;
    setSelectedKey(filtered[0] ? candidateKey(filtered[0]) : null);
  }, [filtered, selectedKey]);

  const selected = filtered.find((c) => candidateKey(c) === selectedKey) || null;

  useEffect(() => {
    if (!selected) {
      setTo('');
      setSubject('');
      setBody('');
      return;
    }
    setTo(selected.to || '');
    setSubject(selected.subject);
    setBody(selected.body);
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps -- reset editor when switching candidate

  const showToast = (text: string, kind: 'success' | 'error') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 5000);
  };

  const send = async () => {
    if (!selected || readOnly) return;
    if (!to.trim()) {
      showToast(bi('Add a recipient email before sending', '請先填寫收件電郵'), 'error');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/invoices/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selected.id,
          type: selected.type,
          to: to.trim(),
          subject: subject.trim(),
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || bi('Failed to send reminder', '催款郵件發送失敗'), 'error');
        return;
      }
      if (data.sent) {
        showToast(
          bi(`Sent reminder for ${data.invoice_number} to ${data.to}`, `已向 ${data.to} 發送 ${data.invoice_number} 催款`),
          'success',
        );
      } else {
        showToast(
          bi(
            `Reminder for ${data.invoice_number} logged (no email provider configured)`,
            `${data.invoice_number} 催款已記錄（未設定電郵服務）`,
          ),
          'success',
        );
      }
      load();
    } catch {
      showToast(bi('Failed to send reminder', '催款郵件發送失敗'), 'error');
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: bi('All', '全部'), count: candidates.length },
    {
      id: 'overdue',
      label: bi('Overdue', '已逾期'),
      count: candidates.filter((c) => c.type === 'overdue').length,
    },
    {
      id: 'due_soon',
      label: bi('Due soon', '即將到期'),
      count: candidates.filter((c) => c.type === 'due_soon').length,
    },
  ];

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to invoices', '返回發票列表')}
          </Link>
          <h1 className="page-title mt-2">{bi('Payment reminders', '催款郵件')}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi(
              `Overdue (past due date) and due soon (within ${dueSoonDays} days). Preview, edit, then send.`,
              `已逾期（過到期日）及即將到期（${dueSoonDays} 天內）。預覽、編輯後發送。`,
            )}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            {bi('Refresh', '重新整理')}
          </button>
        </div>
      </div>

      <div
        className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 mb-4"
        role="group"
        aria-label={bi('Reminder type', '催款類型')}
      >
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 text-sm">
          {bi(
            `No invoices in this list. Overdue = past due & not reminded in ${overdueDays} days. Due soon = due within ${dueSoonDays} days & not yet reminded.`,
            `此列表沒有發票。已逾期＝過到期日且 ${overdueDays} 天內未催款；即將到期＝${dueSoonDays} 天內到期且尚未催款。`,
          )}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {bi(`${filtered.length} due`, `${filtered.length} 張待催款`)}
            </div>
            <ul className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
              {filtered.map((c) => {
                const key = candidateKey(c);
                const active = key === selectedKey;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        active ? 'bg-brand-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-gray-900">{c.invoice_number}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeBadgeClass(c.type)}`}>
                          {typeLabel(c.type)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5 truncate">{c.customer_name || '—'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatCurrency(c.total)} ·{' '}
                        {c.type === 'due_soon'
                          ? bi(`${c.daysOffset}d left`, `尚餘 ${c.daysOffset} 天`)
                          : bi(`${c.daysOffset}d overdue`, `逾期 ${c.daysOffset} 天`)}{' '}
                        · {c.to || bi('No email', '無電郵')}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/invoices/${selected.id}`}
                        className="text-lg font-semibold text-brand-700 hover:underline"
                      >
                        {selected.invoice_number}
                      </Link>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeBadgeClass(selected.type)}`}>
                        {typeLabel(selected.type)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {selected.customer_name || '—'} · {bi('Issue', '開立')}{' '}
                      {formatDate(selected.issue_date)} · {bi('Due', '到期')}{' '}
                      {formatDate(selected.due_date)}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={send}
                      disabled={sending}
                      className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      {sending
                        ? bi('Sending…', '發送中…')
                        : bi('Send reminder', '發送催款')}
                    </button>
                  )}
                </div>

                <div>
                  <label className={labelCls}>{bi('To', '收件人')}</label>
                  <input
                    type="email"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    disabled={readOnly}
                    className={inputCls}
                    placeholder="customer@email.com"
                  />
                </div>
                <div>
                  <label className={labelCls}>{bi('Subject', '主旨')}</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={readOnly}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{bi('Body', '內文')}</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={readOnly}
                    rows={12}
                    className={`${inputCls} font-mono leading-relaxed`}
                  />
                  <p className={hintCls}>
                    {bi(
                      'Plain text — blank lines become paragraphs when sent.',
                      '純文字 — 發送時空行會分成段落。',
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {bi('Preview', '預覽')}
                  </p>
                  <p className="text-sm font-medium text-gray-900 mb-2">{subject || '—'}</p>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{body || '—'}</div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </AppLayout>
  );
}
