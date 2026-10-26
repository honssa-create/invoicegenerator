import PrepSummaryTable from '@/components/kitchen-prep/PrepSummaryTable';
import PrepSessionSummary from '@/components/kitchen-prep/PrepSessionSummary';
import {
  PREP_ORDER_TYPE_LABELS,
  PREP_SCHEDULE_SLOT_LABELS,
  PREP_STATUS_LABELS,
  capacityScheduleTag,
  formulaSummaryForCapacity,
  prepOrderLines,
  summarizePrepOrderLines,
  type PrepBatchView,
  type PrepCalculation,
  type PrepOrder,
  type StewFormulaMapLike,
} from '@/lib/kitchen-prep';
import { TITLE, bi } from '@/lib/ui-labels';

/** One landscape prep sheet. Group print stacks these and page-breaks between them. */
export default function PrepPrintSheet({
  order,
  calc,
  batch,
  stewFormulas,
  printedAt,
}: {
  order: PrepOrder;
  calc: PrepCalculation;
  batch: PrepBatchView | null;
  stewFormulas?: StewFormulaMapLike;
  printedAt: string;
}) {
  const lines = prepOrderLines(order);
  const capacityLabel = lines.map((line) => capacityScheduleTag(line.capacity)).join(' · ');
  const formulaText = Array.from(new Set(lines.map((line) => line.capacity)))
    .map((cap) => formulaSummaryForCapacity(cap))
    .join(' · ');
  const summaryLines = summarizePrepOrderLines(order);
  const sessionLabel = order.schedule_slot
    ? PREP_SCHEDULE_SLOT_LABELS[order.schedule_slot]
    : '未設定';

  return (
    <div className="prep-print-page max-w-[297mm] mx-auto my-8 bg-white shadow-lg print:shadow-none print:my-0 print:max-w-none">
      <div className="p-8 print:p-6 prep-print-sheet">
        <div className="flex justify-between items-start border-b-4 border-brand-600 pb-5 mb-6 print:pb-3 print:mb-4">
          <div>
            <h1 className="text-2xl print:text-xl font-bold text-gray-900 leading-tight">{TITLE.kitchenPrepSheet}</h1>
            <p className="text-base print:text-sm text-gray-600 mt-1">{bi('Kitchen Summary', '廚房總結')}</p>
          </div>
          <div className="text-right">
            <p className="text-xl print:text-lg font-bold font-mono text-brand-700">{order.order_code}</p>
            <p className="text-sm print:text-xs text-gray-500 mt-1">{bi('Printed', '列印時間')} {printedAt}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 print:mb-4 print:gap-2 text-[15px] print:text-xs leading-snug">
          <div><span className="text-gray-500">Stewing Date 燉製日期：</span><strong>{order.stewing_date}</strong></div>
          <div><span className="text-gray-500">時段 Session：</span><strong>{sessionLabel}</strong></div>
          <div><span className="text-gray-500">Order Type：</span><strong>{PREP_ORDER_TYPE_LABELS[order.order_type]}</strong></div>
          <div><span className="text-gray-500">容量 Capacity：</span><strong>{capacityLabel}</strong></div>
          <div><span className="text-gray-500">Status：</span><strong>{PREP_STATUS_LABELS[order.status]}</strong></div>
        </div>

        <div className="mb-4 print:mb-3">
          <PrepSessionSummary lines={summaryLines} />
        </div>

        <p className="mb-4 print:mb-3 text-sm print:text-xs text-gray-600">{formulaText}</p>

        {!calc.formulaReady ? (
          <p className="text-amber-800 bg-amber-50 p-4 rounded text-[15px]">
            Formula for {capacityLabel} is not configured yet.
          </p>
        ) : (
          <PrepSummaryTable
            order={order}
            priorLines={batch?.priorLines}
            batchLabel={batch?.label}
            formulas={stewFormulas}
            variant="print"
          />
        )}

        {order.notes && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 uppercase">Notes</p>
            <p className="text-[15px] mt-1">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
