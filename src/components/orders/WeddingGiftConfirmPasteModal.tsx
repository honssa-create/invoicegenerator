'use client';

import { BTN, bi } from '@/lib/ui-labels';

interface Props {
  open: boolean;
  text: string;
  error: string;
  onClose: () => void;
  onTextChange: (text: string) => void;
  onApply: () => void;
}

export default function WeddingGiftConfirmPasteModal({
  open,
  text,
  error,
  onClose,
  onTextChange,
  onApply,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {bi('Paste confirmation', '貼上確認訊息')}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {bi(
              'Paste the WhatsApp / IG confirmation message. Fields will autofill; you can edit afterward.',
              '貼上 WhatsApp / IG 確認訊息，系統會自動填入欄位，之後仍可手動修改。',
            )}
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={12}
          placeholder={'【📩 即食燕窩回禮 Confirmation】\n…'}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none resize-y min-h-[200px]"
          autoFocus
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn border border-gray-200 text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
          >
            {BTN.cancel}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!text.trim()}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 w-full sm:w-auto"
          >
            {bi('Apply', '套用')}
          </button>
        </div>
      </div>
    </div>
  );
}
