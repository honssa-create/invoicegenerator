'use client';

import {
  buildDebitNotePaymentInstructionsText,
  DEBIT_NOTE_PAYMENT_TEMPLATE_LABELS,
  type DebitNotePaymentTemplateId,
} from '@/lib/rentals';

interface Props {
  templateId: DebitNotePaymentTemplateId;
  onTemplateId: (id: DebitNotePaymentTemplateId) => void;
  manualRemark: string;
  onManualRemark: (v: string) => void;
  noteNo?: string;
  dueDateChinese?: string;
  showPreview?: boolean;
  className?: string;
}

export default function DebitNotePaymentOptions({
  templateId,
  onTemplateId,
  manualRemark,
  onManualRemark,
  noteNo = 'DN-XXXXXX-0000',
  dueDateChinese = 'yyyy年mm月dd日',
  showPreview = true,
  className = '',
}: Props) {
  const preview = buildDebitNotePaymentInstructionsText(
    templateId,
    noteNo,
    dueDateChinese,
    manualRemark,
  );

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Payment template 付款指示範本</label>
        <div className="space-y-2">
          {(['label', 'elite'] as const).map((id) => (
            <label key={id} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="paymentTemplate"
                checked={templateId === id}
                onChange={() => onTemplateId(id)}
                className="mt-1"
              />
              <span className="text-sm text-gray-800">{DEBIT_NOTE_PAYMENT_TEMPLATE_LABELS[id]}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Manual remarks 手動備註 (optional)</label>
        <textarea
          rows={3}
          value={manualRemark}
          onChange={(e) => onManualRemark(e.target.value)}
          placeholder="Additional payment notes…"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none"
        />
      </div>
      {showPreview && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Preview 預覽</label>
          <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}
