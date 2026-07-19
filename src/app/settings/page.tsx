'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import IntegrationsSettingsPanel from '@/components/IntegrationsSettingsPanel';
import {
  OPTION_LABELS,
  OPTION_TYPES,
  type OptionType,
} from '@/lib/expenses';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type SettingsSection = 'dropdowns' | 'integrations';

type ManagedOption = {
  id: number;
  type: OptionType;
  value: string;
};

type OptionsByType = Record<OptionType, ManagedOption[]>;

const EMPTY_OPTIONS: OptionsByType = {
  payment_method: [],
  category: [],
  platform: [],
  supplier: [],
};

export default function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('dropdowns');
  const [activeType, setActiveType] = useState<OptionType>('supplier');
  const [options, setOptions] = useState<OptionsByType>(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/expense-options/manage');
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Failed to load options', kind: 'error' });
        return;
      }
      setOptions({ ...EMPTY_OPTIONS, ...(data.options || {}) });
    } catch {
      setToast({ msg: 'Failed to load dropdown options', kind: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setNewValue('');
    setEditingId(null);
    setEditValue('');
  }, [activeType]);

  const addOption = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newValue.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const res = await fetch('/api/expense-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeType, value: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Failed to add option', kind: 'error' });
        return;
      }
      setNewValue('');
      setToast({ msg: 'Option added', kind: 'success' });
      await load();
    } catch {
      setToast({ msg: 'Failed to add option', kind: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (option: ManagedOption) => {
    setEditingId(option.id);
    setEditValue(option.value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (id: number) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setToast({ msg: 'Option value cannot be empty', kind: 'error' });
      return;
    }

    setBusyId(id);
    try {
      const res = await fetch(`/api/expense-options/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Failed to update option', kind: 'error' });
        return;
      }
      setOptions({ ...EMPTY_OPTIONS, ...(data.options || {}) });
      setEditingId(null);
      setEditValue('');
      setToast({ msg: 'Option updated', kind: 'success' });
    } catch {
      setToast({ msg: 'Failed to update option', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const deleteOption = async (option: ManagedOption) => {
    if (!confirm(`Delete "${option.value}" from ${OPTION_LABELS[option.type]}? Existing records keep their saved value.`)) {
      return;
    }

    setBusyId(option.id);
    try {
      const res = await fetch(`/api/expense-options/${option.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Failed to delete option', kind: 'error' });
        return;
      }
      setOptions({ ...EMPTY_OPTIONS, ...(data.options || {}) });
      if (editingId === option.id) cancelEdit();
      setToast({ msg: 'Option deleted', kind: 'success' });
    } catch {
      setToast({ msg: 'Failed to delete option', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const currentOptions = options[activeType] || [];

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.settings}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Manage expense dropdown options and external API integrations (WooCommerce, QuickBooks, Yedpay).
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            toast.kind === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0 space-y-3">
          <nav className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSection('dropdowns')}
              className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 transition-colors ${
                section === 'dropdowns' ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Expense Dropdowns
              <span className="block text-xs font-normal text-gray-500 mt-0.5">Suppliers, reasons, platforms</span>
            </button>
            <button
              type="button"
              onClick={() => setSection('integrations')}
              className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                section === 'integrations' ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              API Integrations
              <span className="block text-xs font-normal text-gray-500 mt-0.5">WooCommerce, QuickBooks, Yedpay</span>
            </button>
          </nav>

          {section === 'dropdowns' && (
          <nav className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {OPTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                  activeType === type
                    ? 'bg-brand-50 text-brand-800 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {OPTION_LABELS[type]}
                <span className="block text-xs font-normal text-gray-500 mt-0.5">
                  {(options[type] || []).length} option{(options[type] || []).length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </nav>
          )}
        </aside>

        <section className="flex-1 min-w-0">
          {section === 'integrations' ? (
            <IntegrationsSettingsPanel onToast={(msg, kind) => setToast({ msg, kind })} />
          ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{OPTION_LABELS[activeType]}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Changes apply to dropdowns on the Expenses page. Renaming updates matching expense records.
              </p>
            </div>

            <form onSubmit={addOption} className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={`Add new ${OPTION_LABELS[activeType]}…`}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button
                type="submit"
                disabled={adding || !newValue.trim()}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {adding ? bi('Adding…', '新增中…') : `+ ${BTN.add}`}
              </button>
            </form>

            {loading ? (
              <div className="p-12 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
              </div>
            ) : currentOptions.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-sm">{bi('No options yet. Add one above.', '尚無選項。請在上方新增。')}</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {currentOptions.map((option) => (
                  <li key={option.id} className="px-5 py-3 flex items-center gap-3">
                    {editingId === option.id ? (
                      <>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => saveEdit(option.id)}
                          disabled={busyId === option.id}
                          className="px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                        >
                          {BTN.save}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          {BTN.cancel}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-gray-900 break-words">{option.value}</span>
                        <button
                          type="button"
                          onClick={() => startEdit(option)}
                          disabled={busyId === option.id}
                          className="px-3 py-1.5 text-sm font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                        >
                          {BTN.edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteOption(option)}
                          disabled={busyId === option.id}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          {BTN.delete}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
