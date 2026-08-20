'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { compressImage } from '@/lib/imageCompression';
import {
  formatStockQty,
  isBelowSafety,
  stockIconUrl,
  type StockItem,
} from '@/lib/stocks';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

interface ItemForm {
  category: string;
  name: string;
  current_qty: string;
  safety_qty: string;
}

const EMPTY_FORM: ItemForm = {
  category: '',
  name: '',
  current_qty: '0',
  safety_qty: '0',
};

export default function StocksPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<ItemForm>(EMPTY_FORM);
  const [addIcon, setAddIcon] = useState<File | null>(null);
  const [addIconPreview, setAddIconPreview] = useState('');

  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(EMPTY_FORM);
  const [editIcon, setEditIcon] = useState<File | null>(null);
  const [editIconPreview, setEditIconPreview] = useState('');
  const [clearIcon, setClearIcon] = useState(false);

  const [stockUpItem, setStockUpItem] = useState<StockItem | null>(null);
  const [stockUpQty, setStockUpQty] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/stocks')
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => setError(bi('Failed to load stocks', '無法載入庫存')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const c = a.category.localeCompare(b.category, 'zh-Hant');
        if (c !== 0) return c;
        return a.name.localeCompare(b.name, 'zh-Hant');
      }),
    [items]
  );

  const upsertLocal = (item: StockItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.id === item.id);
      if (idx < 0) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  };

  const pickIcon = async (
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (updater: (prev: string) => string) => void
  ) => {
    if (!file) return;
    try {
      const c = await compressImage(file, {
        maxDim: 512,
        targetBytes: 80 * 1024,
        mimeType: 'image/jpeg',
        quality: 0.8,
      });
      setFile(c.file);
      setPreview((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(c.file);
      });
    } catch {
      setError(bi('Failed to read photo', '無法讀取相片'));
    }
  };

  const resetAddForm = () => {
    setAddForm(EMPTY_FORM);
    setAddIcon(null);
    setAddIconPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
  };

  const handleAdd = async () => {
    setError('');
    setSaving(true);
    try {
      const body = new FormData();
      body.set('category', addForm.category);
      body.set('name', addForm.name);
      body.set('current_qty', String(Number(addForm.current_qty) || 0));
      body.set('safety_qty', String(Number(addForm.safety_qty) || 0));
      if (addIcon) body.set('icon', addIcon);

      const res = await fetch('/api/stocks', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || bi('Failed to add item', '新增失敗'));
        return;
      }
      upsertLocal(data.item);
      setShowAdd(false);
      resetAddForm();
    } catch {
      setError(bi('Failed to add item', '新增失敗'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: StockItem) => {
    setError('');
    setEditItem(item);
    setEditForm({
      category: item.category,
      name: item.name,
      current_qty: String(item.current_qty),
      safety_qty: String(item.safety_qty),
    });
    setEditIcon(null);
    setEditIconPreview((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return stockIconUrl(item) || '';
    });
    setClearIcon(false);
  };

  const handleEdit = async () => {
    if (!editItem) return;
    setError('');
    setSaving(true);
    try {
      const body = new FormData();
      body.set('category', editForm.category);
      body.set('name', editForm.name);
      body.set('current_qty', String(Number(editForm.current_qty) || 0));
      body.set('safety_qty', String(Number(editForm.safety_qty) || 0));
      if (clearIcon && !editIcon) body.set('clear_icon', '1');
      if (editIcon) body.set('icon', editIcon);

      const res = await fetch(`/api/stocks/${editItem.id}`, { method: 'PATCH', body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || bi('Failed to update item', '更新失敗'));
        return;
      }
      upsertLocal(data.item);
      setEditItem(null);
    } catch {
      setError(bi('Failed to update item', '更新失敗'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: StockItem) => {
    if (!confirm(bi(`Delete "${item.name}"?`, `刪除「${item.name}」？`))) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/stocks/${item.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || bi('Failed to delete item', '刪除失敗'));
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      if (editItem?.id === item.id) setEditItem(null);
      if (stockUpItem?.id === item.id) setStockUpItem(null);
    } catch {
      setError(bi('Failed to delete item', '刪除失敗'));
    } finally {
      setSaving(false);
    }
  };

  const openStockUp = (item: StockItem) => {
    setError('');
    setStockUpItem(item);
    setStockUpQty('');
  };

  const handleStockUp = async () => {
    if (!stockUpItem) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/stocks/${stockUpItem.id}/stock-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: Number(stockUpQty) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || bi('Failed to stock up', '補貨失敗'));
        return;
      }
      upsertLocal(data.item);
      setStockUpItem(null);
      setStockUpQty('');
    } catch {
      setError(bi('Failed to stock up', '補貨失敗'));
    } finally {
      setSaving(false);
    }
  };

  const formFields = (
    form: ItemForm,
    setForm: (f: ItemForm) => void,
    opts?: { includeCurrent?: boolean }
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="block text-sm">
        <span className="text-gray-600">{bi('Category', '類別')}</span>
        <input
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">{bi('Item', '物件')}</span>
        <input
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      {(opts?.includeCurrent ?? true) && (
        <label className="block text-sm">
          <span className="text-gray-600">{bi('Current qty', '現有數量')}</span>
          <input
            type="number"
            min={0}
            step="any"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
            value={form.current_qty}
            onChange={(e) => setForm({ ...form, current_qty: e.target.value })}
          />
        </label>
      )}
      <label className="block text-sm">
        <span className="text-gray-600">{bi('Safety qty', '安全數量')}</span>
        <input
          type="number"
          min={0}
          step="any"
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
          value={form.safety_qty}
          onChange={(e) => setForm({ ...form, safety_qty: e.target.value })}
        />
      </label>
    </div>
  );

  const iconPicker = (
    preview: string,
    onPick: (file: File | undefined) => void,
    onClear?: () => void
  ) => (
    <div className="mt-4">
      <span className="text-sm text-gray-600">{bi('Photo icon', '相片圖示')}</span>
      <div className="mt-1 flex items-center gap-3">
        {preview ? (
          <img src={preview} alt="" className="h-14 w-14 rounded-lg object-cover border border-gray-200" />
        ) : (
          <div className="h-14 w-14 rounded-lg border border-dashed border-gray-300 bg-gray-50" />
        )}
        <label className="btn border border-gray-300 text-gray-700 cursor-pointer">
          {bi('Choose photo', '選擇相片')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              onPick(file);
            }}
          />
        </label>
        {onClear && preview && (
          <button type="button" className="text-sm text-gray-500 hover:text-red-600" onClick={onClear}>
            {bi('Remove', '移除')}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.stocks}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi('Company-wide stock list — stock up anytime; admins manage items', '公司共用庫存 — 全員可補貨，管理員管理項目')}
          </p>
        </div>
        <div className="page-actions">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setError('');
                resetAddForm();
                setShowAdd(true);
              }}
              className="btn bg-brand-600 text-white hover:bg-brand-700"
            >
              + {bi('Add item', '新增項目')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showAdd && isAdmin && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">{bi('Add item', '新增項目')}</h2>
          {formFields(addForm, setAddForm)}
          {iconPicker(
            addIconPreview,
            (file) => void pickIcon(file, setAddIcon, setAddIconPreview),
            () => {
              setAddIcon(null);
              setAddIconPreview((prev) => {
                if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                return '';
              });
            }
          )}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              className="btn border border-gray-300 text-gray-700"
              onClick={() => setShowAdd(false)}
              disabled={saving}
            >
              {BTN.cancel}
            </button>
            <button
              type="button"
              className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              onClick={handleAdd}
              disabled={saving || !addForm.category.trim() || !addForm.name.trim()}
            >
              {saving ? BTN.saving : BTN.create}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{bi('Stock list', '庫存列表')}</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi('No stock items yet.', '尚無庫存項目。')}
            {isAdmin && ` ${bi('Add one to get started.', '請新增第一筆。')}`}
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">{bi('Category', '類別')}</th>
                <th className="px-4 py-3">{bi('Item', '物件')}</th>
                <th className="px-4 py-3 text-right">{bi('Current qty', '現有數量')}</th>
                <th className="px-4 py-3 text-right">{bi('Safety qty', '安全數量')}</th>
                <th className="px-4 py-3 text-right">{bi('Action', '操作')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((item) => (
                <tr key={item.id} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3 text-gray-700">{item.category}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {stockIconUrl(item) ? (
                        <img
                          src={stockIconUrl(item)!}
                          alt=""
                          className="h-9 w-9 rounded-md object-cover border border-gray-200 shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-gray-100 border border-gray-200 shrink-0" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold tabular-nums ${
                      isBelowSafety(item) ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {formatStockQty(item.current_qty)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {formatStockQty(item.safety_qty)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => openStockUp(item)}
                        className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700"
                      >
                        {bi('Stock up', '補貨')}
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            {BTN.edit}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={saving}
                            className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {BTN.delete}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editItem && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              {bi('Edit item', '編輯項目')} — {editItem.name}
            </h2>
            {formFields(editForm, setEditForm)}
            {iconPicker(
              !clearIcon ? editIconPreview : '',
              (file) => {
                setClearIcon(false);
                void pickIcon(file, setEditIcon, setEditIconPreview);
              },
              () => {
                setEditIcon(null);
                setClearIcon(true);
                setEditIconPreview((prev) => {
                  if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                  return '';
                });
              }
            )}
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="btn border border-gray-300 text-gray-700"
                onClick={() => setEditItem(null)}
                disabled={saving}
              >
                {BTN.cancel}
              </button>
              <button
                type="button"
                className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                onClick={handleEdit}
                disabled={saving || !editForm.category.trim() || !editForm.name.trim()}
              >
                {saving ? BTN.saving : BTN.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {stockUpItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-1">{bi('Stock up', '補貨')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {stockUpItem.category} · {stockUpItem.name}
              <span className="block mt-1">
                {bi('Current', '現有')}: {formatStockQty(stockUpItem.current_qty)}
              </span>
            </p>
            <label className="block text-sm">
              <span className="text-gray-600">{bi('Add quantity', '增加數量')}</span>
              <input
                type="number"
                min={0}
                step="any"
                autoFocus
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                value={stockUpQty}
                onChange={(e) => setStockUpQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleStockUp();
                }}
              />
            </label>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="btn border border-gray-300 text-gray-700"
                onClick={() => setStockUpItem(null)}
                disabled={saving}
              >
                {BTN.cancel}
              </button>
              <button
                type="button"
                className="btn bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                onClick={handleStockUp}
                disabled={saving || !(Number(stockUpQty) > 0)}
              >
                {saving ? BTN.saving : bi('Confirm', '確認')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
