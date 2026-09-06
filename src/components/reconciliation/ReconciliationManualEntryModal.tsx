'use client';

import { useRef, useState } from 'react';
import { compressImage } from '@/lib/imageCompression';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/reconciliation';
import {
  EMPTY_MANUAL_PAYMENT,
  RECONCILIATION_SELECT_CLS,
} from '@/lib/reconciliation-page-utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export default function ReconciliationManualEntryModal({ open, onClose, onSaved, onError }: Props) {
  const receiptRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY_MANUAL_PAYMENT);
  const [receiptPath, setReceiptPath] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setForm(EMPTY_MANUAL_PAYMENT);
    setReceiptPath('');
    setPreview(null);
    setUploadMsg('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleReceipt = async (file: File) => {
    setUploadMsg('Compressing…');
    let out = file;
    try {
      const c = await compressImage(file, {
        maxDim: 1600,
        targetBytes: 300 * 1024,
        mimeType: 'image/jpeg',
        quality: 0.65,
      });
      out = c.file;
      setUploadMsg(`Compressed → ${Math.round(out.size / 1024)}KB`);
    } catch {
      /* keep original */
    }
    setPreview(URL.createObjectURL(out));
    const fd = new FormData();
    fd.append('file', out);
    const res = await fetch('/api/reconciliation/upload-receipt', { method: 'POST', body: fd });
    const d = await res.json();
    if (res.ok) {
      setReceiptPath(d.path);
      setUploadMsg(`Uploaded · ${Math.round(out.size / 1024)}KB`);
    } else {
      setUploadMsg(d.error || 'Upload failed');
    }
  };

  const save = async () => {
    setError('');
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('請輸入有效銀碼');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/reconciliation/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_method: form.payment_method,
        transaction_id: form.transaction_id.trim() || undefined,
        invoice_no: form.invoice_no.trim() || undefined,
        order_no: form.order_no.trim() || undefined,
        remarks: form.remarks.trim() || undefined,
        receipt_path: receiptPath || undefined,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(d.error || 'Failed to save');
      onError(d.error || 'Failed to save');
      return;
    }
    reset();
    onClose();
    onSaved(
      `Manual payment #${d.record?.id} saved` +
        (d.record?.status === 'Pending Approval' ? ' — pending approval' : '') +
        (d.record?.status === 'Discrepancy' ? ' — amount discrepancy' : ''),
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 my-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">手動入帳 Manual Payment</h2>
        <p className="text-sm text-gray-500 mb-4">Enter a deposit not from Yedpay / bank statement upload</p>
        {error ? <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div> : null}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">銀碼 Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className={RECONCILIATION_SELECT_CLS}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment method 付款方式 *</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
              className={RECONCILIATION_SELECT_CLS}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Transaction ID</label>
            <input
              value={form.transaction_id}
              onChange={(e) => setForm({ ...form, transaction_id: e.target.value })}
              className={RECONCILIATION_SELECT_CLS}
              placeholder="e.g. bank / PayMe / FPS reference"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Invoice no.</label>
            <input
              value={form.invoice_no}
              onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
              className={RECONCILIATION_SELECT_CLS}
              placeholder="e.g. 2026080012"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Order no.</label>
            <input
              value={form.order_no}
              onChange={(e) => setForm({ ...form, order_no: e.target.value })}
              className={RECONCILIATION_SELECT_CLS}
              placeholder="e.g. ORD-0000123 / PO#"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">備註 Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={2}
              className={RECONCILIATION_SELECT_CLS}
              placeholder="Optional notes"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">收據上傳 Receipt</label>
            <div
              onClick={() => receiptRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) void handleReceipt(e.dataTransfer.files[0]);
              }}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
            >
              <input
                ref={receiptRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) void handleReceipt(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="receipt" className="max-h-28 mx-auto rounded" />
              ) : (
                <>
                  <div className="text-2xl mb-1">📎</div>
                  <p className="text-xs text-gray-500">Drag/drop or click to upload</p>
                </>
              )}
              {uploadMsg ? <p className="text-[11px] text-brand-700 mt-2">{uploadMsg}</p> : null}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
            >
              {saving ? 'Saving…' : '儲存 Save'}
            </button>
            <button
              onClick={handleClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
