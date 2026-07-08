'use client';

import '@/styles/formal-debit-note.css';
import { formatMoney, type FormalDebitNote } from '@/lib/rentals';

interface Props {
  doc: FormalDebitNote;
  styleTemplate?: DebitNoteStyleTemplate;
}

function moneyCell(amount: number) {
  return new Intl.NumberFormat('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export default function FormalDebitNoteDocument({ doc, styleTemplate }: Props) {
  const { company } = doc;
  const styleVars = styleTemplate ? debitNoteStyleToCssVars(styleTemplate) : undefined;

  return (
    <div className="formal-debit-note a4-page-content">
      <header className="dn-header">
        <p className="dn-company-zh">{company.nameZh}</p>
        <p className="dn-company-en">{company.nameEn}</p>
        <p className="dn-company-meta">
          {company.address} · {company.phone} · {company.taxId}
        </p>
        <h1 className="dn-title">繳 費 通 知 單</h1>
        <p className="dn-subtitle">DEBIT NOTE</p>
      </header>

      <div className="dn-meta">
        <div>
          <p>
            <span className="dn-label">致 (To):</span>{' '}
            <span className="dn-value-strong">{doc.tenant.name}</span>
          </p>
          <p style={{ marginTop: '0.25rem' }}>
            <span className="dn-label">物業 (Premises):</span> {doc.premises}
          </p>
        </div>
        <div className="dn-meta-right">
          <p>
            <span className="dn-label">單據編號 (Note No.):</span>{' '}
            <span className="dn-value-strong">{doc.noteNo}</span>
          </p>
          <p>
            <span className="dn-label">發單日期 (Date):</span> {doc.issuedDateDisplay}
          </p>
          <p>
            <span className="dn-label">到期繳款日 (Due Date):</span>{' '}
            <span className="dn-value-strong">{doc.dueDateDisplay}</span>
          </p>
        </div>
      </div>

      <section className="dn-section">
        <h2 className="dn-section-title">
          【第一部份：本期新增費用 (Current Period Charges: {doc.targetPeriodLabel})】
        </h2>
        <table className="dn-table">
          <thead>
            <tr>
              <th>項目 / 單位 (Premises)</th>
              <th>費用類別 (Description)</th>
              <th className="dn-th-right">金額 (Amount HK$)</th>
            </tr>
          </thead>
          <tbody>
            {doc.currentCharges.length === 0 ? (
              <tr>
                <td colSpan={3} className="dn-empty">
                  本期無未付費用
                </td>
              </tr>
            ) : (
              doc.currentCharges.map((line, i) => (
                <tr key={i}>
                  <td className="dn-td-medium">{line.unitName}</td>
                  <td>{line.description}</td>
                  <td className="dn-td-right dn-td-medium">{moneyCell(line.amount)}</td>
                </tr>
              ))
            )}
            <tr className="dn-subtotal-row">
              <td colSpan={2}>本期小計 (Current Subtotal):</td>
              <td className="dn-td-right">${moneyCell(doc.currentSubtotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {doc.arrearRows.length > 0 && (
        <section className="dn-section">
          <h2 className="dn-section-title">
            【第二部份：前期逾期欠款 (Overdue Arrears Summary)】
          </h2>
          {doc.settledPeriodsNote && <p className="dn-settled-note">{doc.settledPeriodsNote}</p>}
          <table className="dn-table">
            <thead>
              <tr>
                <th>帳期 (Period)</th>
                <th>欠款單位及項目 (Unpaid Details)</th>
                <th className="dn-th-right">欠款金額 (Arrears HK$)</th>
              </tr>
            </thead>
            <tbody>
              {doc.arrearRows.map((row) => (
                <tr key={row.period}>
                  <td className="dn-td-medium">{row.periodLabel}</td>
                  <td>{row.details}</td>
                  <td className="dn-td-right dn-td-medium">{moneyCell(row.amount)}</td>
                </tr>
              ))}
              <tr className="dn-subtotal-row">
                <td colSpan={2}>前期欠款總計 (Total Arrears):</td>
                <td className="dn-td-right">${moneyCell(doc.totalArrears)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <div className="dn-total-box">
        <table>
          <tbody>
            <tr>
              <td>本期應繳費用 (Current Month Charges):</td>
              <td className="dn-amount">HK$ {moneyCell(doc.currentSubtotal)}</td>
            </tr>
            {doc.totalArrears > 0 && (
              <tr>
                <td>逾期未繳款項 (Overdue Arrears):</td>
                <td className="dn-amount">HK$ {moneyCell(doc.totalArrears)}</td>
              </tr>
            )}
            <tr className="dn-total-row">
              <td className="dn-total-label">本期應繳總額 (TOTAL AMOUNT DUE):</td>
              <td className="dn-total-amount">HK$ {moneyCell(doc.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="dn-footer">
        <h3 className="dn-footer-title">【底部：付款指示與備註 Payment Instructions & Remarks】</h3>
        <pre className="dn-footer-instructions">{doc.paymentInstructionsText}</pre>
        {doc.footerRemark && <p className="dn-footer-remark">{doc.footerRemark}</p>}
      </footer>
    </div>
  );
}
