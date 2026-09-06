'use client';

import { useRef, type CSSProperties } from 'react';
import '@/styles/formal-debit-note.css';
import {
  DEFAULT_DEBIT_NOTE_STYLE,
  debitNoteStyleToCssVars,
  type DebitNoteStyleTemplate,
} from '@/lib/debit-note-style';
import { formatDebitNoteCompanyMeta, formatTenantDisplayName, splitDebitNotePaymentBlocks, type FormalDebitNote } from '@/lib/rentals';
import { PRINT_PAGE_FOOTER_RESERVE_MM, PRINT_PAGE_HEIGHT_MM } from '@/lib/print-page-numbers';
import PrintPageNumbers, { useA4PrintPageCount } from '@/components/PrintPageNumbers';

interface Props {
  doc: FormalDebitNote;
  styleTemplate?: DebitNoteStyleTemplate;
  /** Soften page chrome for browser print / PDF (matches invoice/receipt preview). */
  printMode?: boolean;
}

function moneyCell(amount: number) {
  return new Intl.NumberFormat('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export default function FormalDebitNoteDocument({
  doc,
  styleTemplate = DEFAULT_DEBIT_NOTE_STYLE,
  printMode = false,
}: Props) {
  const { company } = doc;
  const companyMeta = formatDebitNoteCompanyMeta(company);
  const styleVars = debitNoteStyleToCssVars(styleTemplate);
  const pageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pageCount = useA4PrintPageCount(pageRef, bodyRef, {
    footerReserveMm: PRINT_PAGE_FOOTER_RESERVE_MM,
  });
  const paymentBlocks = splitDebitNotePaymentBlocks(doc.paymentInstructionsText);

  return (
    <div
      ref={pageRef}
      className={`dn-preview-page formal-debit-note relative bg-white mx-auto ${
        printMode ? 'dn-print-mode shadow-none' : 'shadow-lg'
      }`}
      style={
        {
          width: '210mm',
          minHeight: `calc(${pageCount} * ${PRINT_PAGE_HEIGHT_MM}mm)`,
          padding: styleTemplate.pagePadding || 'var(--dn-page-padding)',
          ...styleVars,
        } as CSSProperties
      }
    >
      <style>{`
        .dn-preview-page .quo-page-number {
          position: absolute;
          left: 0;
          right: 0;
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          padding: 0 52px 8px 0;
          font-size: 11px;
          line-height: 1;
          color: #666666;
          text-align: right;
          pointer-events: none;
          user-select: none;
          z-index: 2;
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          .dn-preview-page {
            width: 100% !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .dn-preview-page .dn-total-box {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .dn-preview-page .dn-print-keep,
          .dn-preview-page .dn-meta {
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          .dn-preview-page a[href]::after {
            content: none !important;
          }
          .dn-preview-page a[href] {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>

      <div ref={bodyRef}>
        <header className="dn-header">
          <p className="dn-company-zh">{company.nameZh}</p>
          <p className="dn-company-en">{company.nameEn}</p>
          {companyMeta && <p className="dn-company-meta">{companyMeta}</p>}
          <h1 className="dn-title">繳 費 通 知 單</h1>
          <p className="dn-subtitle">DEBIT NOTE</p>
        </header>

        <div className="dn-meta">
          <div className="dn-meta-left">
            <p>
              <span className="dn-label">致 (To):</span>{' '}
              <span className="dn-value-strong">{formatTenantDisplayName(doc.tenant)}</span>
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
            本期新增費用 (Current Period Charges: {doc.targetPeriodLabel})
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
              前期逾期欠款 (Overdue Arrears Summary)
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

        <div className="dn-total-box dn-print-keep">
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
          <h3 className="dn-footer-title">付款指示與備註 Payment Instructions & Remarks</h3>
          {paymentBlocks.map((block, i) => (
            <pre key={i} className="dn-footer-instructions dn-print-keep">
              {block}
            </pre>
          ))}
          {doc.footerRemark && <p className="dn-footer-remark dn-print-keep">{doc.footerRemark}</p>}
        </footer>
      </div>

      <PrintPageNumbers total={pageCount} footerReserveMm={PRINT_PAGE_FOOTER_RESERVE_MM} />
    </div>
  );
}
