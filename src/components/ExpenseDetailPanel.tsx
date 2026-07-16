'use client';

import { type ReactNode } from 'react';
import {
  EXPENSE_STATUS_COLORS,
  FUNDING_SOURCE_CC_SELF,
  categoryLabel,
  expenseSupplierName,
  formatMoney,
  fundingSourceLabel,
  paymentChannelLabel,
} from '@/lib/expenses';
import { expenseReceiptUrl } from '@/lib/image-url';
import type { Expense } from '@/lib/types';

function detailField(label: string, value: ReactNode) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value || '—'}</p>
    </div>
  );
}

type ExpenseDetailPanelProps = {
  expense: Expense;
  actions?: ReactNode;
  interactive?: boolean;
  onReceiptClick?: (index: number) => void;
  onImageReady?: (key: string) => void;
};

export default function ExpenseDetailPanel({
  expense,
  actions,
  interactive = false,
  onReceiptClick,
  onImageReady,
}: ExpenseDetailPanelProps) {
  const receipts = expense.receipts || [];

  return (
    <div className="expense-detail-panel">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Expense Detail 支出詳情</p>
          <h2 className="text-xl sm:text-2xl font-bold font-mono text-gray-900 mt-1">
            {expense.receipt_no || `EXP-${expense.id}`}
          </h2>
          {expense.batch_id && (
            <p className="text-sm font-mono text-gray-500 mt-0.5">Expense ID {expense.batch_id}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">{expenseSupplierName(expense) || 'Unnamed supplier'}</p>
        </div>
        {actions ? <div className="flex gap-2 shrink-0 no-print">{actions}</div> : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100 expense-detail-fields print:bg-white print:border-gray-200">
        {detailField('Receipt No. 收據編號', expense.receipt_no || `EXP-${expense.id}`)}
        {expense.batch_id && detailField('Expense ID 報銷單編號', expense.batch_id)}
        {detailField('Paid Date 支出日期', expense.paid_date)}
        {detailField('Platform 消費平台', expense.platform)}
        {detailField('Supplier 供應商', expense.merchant)}
        {expense.supplier_input && detailField('供應商 (input)', expense.supplier_input)}
        {detailField('支出金額(RMB)', formatMoney(expense.amount_rmb, 'CNY'))}
        {detailField('支出金額(HKD)', formatMoney(expense.amount_hkd, 'HKD'))}
        {detailField('Payment Channel 支付渠道', paymentChannelLabel(expense.payment_channel))}
        {detailField('Funding Source 扣款來源', fundingSourceLabel(expense.funding_source))}
        {expense.funding_source === FUNDING_SOURCE_CC_SELF && expense.card_last4
          ? detailField('Card Last 4 信用卡尾四位', expense.card_last4)
          : null}
        {!expense.funding_source && expense.payment_method
          ? detailField('Payment 支付方式 [legacy]', expense.payment_method)
          : null}
        {detailField('Reason 支出原因', categoryLabel(expense.category))}
        {detailField('Order No. 訂單編號', expense.order_no)}
        <div>
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Status 付款狀態</p>
          <span
            className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${EXPENSE_STATUS_COLORS[expense.payment_status]}`}
          >
            {expense.payment_status}
          </span>
        </div>
      </div>

      {expense.notes && (
        <div className="mb-4">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Notes 注意事項</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">
            {expense.notes}
          </p>
        </div>
      )}

      {expense.special_notes && (
        <div className="mb-6">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Special Notes 特別事項</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">
            {expense.special_notes}
          </p>
        </div>
      )}

      {!expense.notes && !expense.special_notes && <div className="mb-6" />}

      <div>
        <p className="text-sm font-semibold text-gray-900 mb-3">
          Receipt Images 付款收據 ({receipts.length})
        </p>
        {receipts.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center border border-dashed border-gray-200 rounded-xl">
            No receipt images attached.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 expense-detail-receipts-grid">
            {receipts.map((r, i) => {
              const imageKey = `r-${r.id}`;
              const card = (
                <>
                  <div className="bg-brand-50 px-3 py-1.5 text-xs font-mono font-semibold text-brand-800 border-b border-brand-100 flex items-center justify-between expense-detail-receipt-caption">
                    <span>
                      {expense.receipt_no || `EXP-${expense.id}`} · #{i + 1}
                    </span>
                    {interactive ? (
                      <span className="text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        🔍 Enlarge
                      </span>
                    ) : null}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={expenseReceiptUrl(r, expense.id)}
                    alt={`Receipt ${i + 1}`}
                    data-image-key={imageKey}
                    loading="eager"
                    decoding="sync"
                    onLoad={() => onImageReady?.(imageKey)}
                    onError={() => onImageReady?.(imageKey)}
                    className="expense-detail-receipt-img w-full object-contain max-h-[45vh] bg-gray-50"
                  />
                </>
              );

              if (interactive && onReceiptClick) {
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onReceiptClick(i)}
                    className="expense-detail-receipt-card group text-left border border-gray-200 rounded-xl overflow-hidden hover:ring-2 hover:ring-brand-400 transition-shadow bg-white"
                  >
                    {card}
                  </button>
                );
              }

              return (
                <div
                  key={r.id}
                  className="expense-detail-receipt-card border border-gray-200 rounded-xl overflow-hidden bg-white"
                >
                  {card}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
