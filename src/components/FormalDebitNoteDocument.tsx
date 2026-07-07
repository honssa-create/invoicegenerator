'use client';

import { formatMoney, type FormalDebitNote } from '@/lib/rentals';

interface Props {
  doc: FormalDebitNote;
}

function moneyCell(amount: number) {
  return new Intl.NumberFormat('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export default function FormalDebitNoteDocument({ doc }: Props) {
  const { company } = doc;

  return (
    <div className="formal-debit-note a4-page-content text-sm text-gray-900 leading-relaxed">
      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
        <p className="font-bold text-base">{company.nameZh}</p>
        <p className="font-semibold text-sm tracking-wide mt-0.5">{company.nameEn}</p>
        <p className="text-xs text-gray-600 mt-1">
          {company.address} · {company.phone} · {company.taxId}
        </p>
        <h1 className="text-2xl font-bold tracking-[0.35em] mt-5">繳 費 通 知 單</h1>
        <p className="text-sm font-semibold tracking-[0.25em] text-gray-600">DEBIT NOTE</p>
      </div>

      {/* Meta block */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-6 text-sm border-b border-gray-300 pb-4">
        <div>
          <p><span className="text-gray-500">致 (To):</span> <span className="font-semibold">{doc.tenant.name}</span></p>
          <p className="mt-1"><span className="text-gray-500">物業 (Premises):</span> {doc.premises}</p>
        </div>
        <div className="text-right space-y-1">
          <p><span className="text-gray-500">單據編號 (Note No.):</span> <span className="font-semibold">{doc.noteNo}</span></p>
          <p><span className="text-gray-500">發單日期 (Date):</span> {doc.issuedDateDisplay}</p>
          <p><span className="text-gray-500">到期繳款日 (Due Date):</span> <span className="font-semibold">{doc.dueDateDisplay}</span></p>
        </div>
      </div>

      {/* Part 1: Current period */}
      <section className="mb-8">
        <h2 className="font-bold text-base mb-2">
          【第一部份：本期新增費用 (Current Period Charges: {doc.targetPeriodLabel})】
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-400">
              <th className="text-left py-2 pr-2 font-semibold">項目 / 單位 (Premises)</th>
              <th className="text-left py-2 px-2 font-semibold">費用類別 (Description)</th>
              <th className="text-right py-2 pl-2 font-semibold whitespace-nowrap">金額 (Amount HK$)</th>
            </tr>
          </thead>
          <tbody>
            {doc.currentCharges.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-3 text-center text-gray-400">本期無未付費用</td>
              </tr>
            ) : (
              doc.currentCharges.map((line, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-2 pr-2 font-medium">{line.unitName}</td>
                  <td className="py-2 px-2">{line.description}</td>
                  <td className="py-2 pl-2 text-right font-medium tabular-nums">{moneyCell(line.amount)}</td>
                </tr>
              ))
            )}
            <tr className="border-t-2 border-gray-400 font-bold">
              <td colSpan={2} className="py-2 text-right pr-4">本期小計 (Current Subtotal):</td>
              <td className="py-2 text-right tabular-nums">${moneyCell(doc.currentSubtotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Part 2: Overdue arrears */}
      {doc.arrearRows.length > 0 && (
        <section className="mb-8">
          <h2 className="font-bold text-base mb-1">
            【第二部份：前期逾期欠款 (Overdue Arrears Summary)】
          </h2>
          {doc.settledPeriodsNote && (
            <p className="text-xs text-gray-600 mb-2 italic">{doc.settledPeriodsNote}</p>
          )}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-400">
                <th className="text-left py-2 pr-2 font-semibold">帳期 (Period)</th>
                <th className="text-left py-2 px-2 font-semibold">欠款單位及項目 (Unpaid Details)</th>
                <th className="text-right py-2 pl-2 font-semibold whitespace-nowrap">欠款金額 (Arrears HK$)</th>
              </tr>
            </thead>
            <tbody>
              {doc.arrearRows.map((row) => (
                <tr key={row.period} className="border-b border-gray-200">
                  <td className="py-2 pr-2 font-medium">{row.periodLabel}</td>
                  <td className="py-2 px-2">{row.details}</td>
                  <td className="py-2 pl-2 text-right font-medium tabular-nums">{moneyCell(row.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-400 font-bold">
                <td colSpan={2} className="py-2 text-right pr-4">前期欠款總計 (Total Arrears):</td>
                <td className="py-2 text-right tabular-nums">${moneyCell(doc.totalArrears)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Grand total callout */}
      <div className="my-8 border-2 border-gray-400 bg-amber-50/60 p-4 print:bg-amber-50">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1.5 font-medium">本期應繳費用 (Current Month Charges):</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">HK$ {moneyCell(doc.currentSubtotal)}</td>
            </tr>
            {doc.totalArrears > 0 && (
              <tr>
                <td className="py-1.5 font-medium">逾期未繳款項 (Overdue Arrears):</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">HK$ {moneyCell(doc.totalArrears)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-gray-500">
              <td className="pt-3 pb-1 text-base font-bold">本期應繳總額 (TOTAL AMOUNT DUE):</td>
              <td className="pt-3 pb-1 text-right text-xl font-bold text-red-800 tabular-nums">
                HK$ {moneyCell(doc.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment instructions */}
      <section className="border-t border-gray-300 pt-4 text-sm">
        <h3 className="font-bold mb-2">【底部：付款指示與備註 Payment Instructions & Remarks】</h3>
        <pre className="whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
          {doc.paymentInstructionsText}
        </pre>
        {doc.footerRemark && (
          <p className="mt-3 font-medium text-gray-900 border-t border-dashed border-gray-300 pt-3">
            {doc.footerRemark}
          </p>
        )}
      </section>
    </div>
  );
}
