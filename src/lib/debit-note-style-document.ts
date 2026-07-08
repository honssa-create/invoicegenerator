import type { DebitNoteStyleTemplate } from '@/lib/debit-note-style';

function escCss(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Self-contained HTML document for editing debit note styles offline (opens in Word or browser). */
export function buildDebitNoteStyleTemplateHtml(style: DebitNoteStyleTemplate): string {
  const s = style;
  return `<!DOCTYPE html>
<html lang="zh-Hant" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="InvoiceFlow" />
  <title>Debit Note Style Template — 繳費通知單樣式範本</title>
  <!-- Edit the :root { } block below, then re-upload this file to apply styles -->
  <style>
    :root {
      --dn-font-family: '${escCss(s.fontFamily)}';
      --dn-font-size: ${s.fontSize};
      --dn-line-height: ${s.lineHeight};
      --dn-color-text: ${s.colorText};
      --dn-color-muted: ${s.colorMuted};
      --dn-color-border: ${s.colorBorder};
      --dn-color-border-strong: ${s.colorBorderStrong};
      --dn-color-total: ${s.colorTotal};
      --dn-color-total-bg: ${s.colorTotalBg};
      --dn-header-title-size: ${s.headerTitleSize};
      --dn-header-title-spacing: ${s.headerTitleSpacing};
      --dn-header-subtitle-spacing: ${s.headerSubtitleSpacing};
      --dn-page-padding: ${s.pagePadding};
      --dn-section-gap: ${s.sectionGap};
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; font-family: var(--dn-font-family); }
    .edit-banner {
      max-width: 210mm; margin: 1rem auto 0; padding: 12px 16px;
      background: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px;
      font-size: 13px; line-height: 1.5; color: #1e3a5f;
    }
    .preview-page {
      width: 210mm; min-height: 297mm; margin: 1rem auto 2rem;
      padding: var(--dn-page-padding); background: white;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    }
    .formal-debit-note {
      font-family: var(--dn-font-family); font-size: var(--dn-font-size);
      line-height: var(--dn-line-height); color: var(--dn-color-text);
    }
    .dn-header { text-align: center; border-bottom: 2px solid var(--dn-color-border-strong); padding-bottom: 16px; margin-bottom: 24px; }
    .dn-company-zh { font-weight: 700; font-size: 16px; margin: 0; }
    .dn-company-en { font-weight: 600; font-size: 14px; margin: 2px 0 0; }
    .dn-company-meta { font-size: 12px; color: var(--dn-color-muted); margin: 4px 0 0; }
    .dn-title { font-size: var(--dn-header-title-size); font-weight: 700; letter-spacing: var(--dn-header-title-spacing); margin: 20px 0 0; }
    .dn-subtitle { font-size: 14px; font-weight: 600; letter-spacing: var(--dn-header-subtitle-spacing); color: var(--dn-color-muted); margin: 4px 0 0; }
    .dn-meta { display: table; width: 100%; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #d1d5db; font-size: var(--dn-font-size); }
    .dn-meta-left { display: table-cell; width: 50%; vertical-align: top; }
    .dn-meta-right { display: table-cell; width: 50%; text-align: right; vertical-align: top; }
    .dn-meta p { margin: 0 0 4px; }
    .dn-label { color: var(--dn-color-muted); }
    .dn-value-strong { font-weight: 600; }
    .dn-section { margin-bottom: var(--dn-section-gap); }
    .dn-section-title { font-weight: 700; font-size: 16px; margin: 0 0 8px; }
    .dn-table { width: 100%; border-collapse: collapse; font-size: var(--dn-font-size); }
    .dn-table thead tr { border-top: 1px solid var(--dn-color-border); border-bottom: 1px solid var(--dn-color-border); }
    .dn-table th { text-align: left; padding: 8px; font-weight: 600; }
    .dn-table th.dn-th-right { text-align: right; }
    .dn-table td { padding: 8px; vertical-align: top; }
    .dn-table tbody tr { border-bottom: 1px solid #e5e7eb; }
    .dn-table .dn-td-right { text-align: right; }
    .dn-table .dn-empty { text-align: center; color: var(--dn-color-muted); padding: 12px; }
    .dn-table .dn-subtotal-row { border-top: 2px solid var(--dn-color-border); font-weight: 700; }
    .dn-table .dn-subtotal-row td:first-child { text-align: right; padding-right: 16px; }
    .dn-total-box { margin: 32px 0; border: 2px solid var(--dn-color-border); background: var(--dn-color-total-bg); padding: 16px; }
    .dn-total-box table { width: 100%; border-collapse: collapse; font-size: var(--dn-font-size); }
    .dn-total-box td { padding: 6px 0; }
    .dn-total-box .dn-total-row { border-top: 2px solid #6b7280; }
    .dn-total-box .dn-total-label { padding-top: 12px; font-size: 16px; font-weight: 700; }
    .dn-total-box .dn-total-amount { padding-top: 12px; text-align: right; font-size: 20px; font-weight: 700; color: var(--dn-color-total); }
    .dn-total-box .dn-amount { text-align: right; font-weight: 600; }
    .dn-footer { border-top: 1px solid #d1d5db; padding-top: 16px; font-size: var(--dn-font-size); }
    .dn-footer-title { font-weight: 700; margin: 0 0 8px; }
    .dn-footer-instructions { white-space: pre-wrap; font-family: var(--dn-font-family); color: #1f2937; line-height: var(--dn-line-height); margin: 0; }
    @media print {
      .edit-banner { display: none !important; }
      body { background: white; }
      .preview-page { margin: 0; box-shadow: none; width: 100%; }
      .dn-total-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="edit-banner">
    <strong>Debit Note Style Template 繳費通知單樣式範本</strong>
    Edit the <code>:root</code> variables in &lt;style&gt; above · Open in Word or browser · Upload back to apply.
  </div>
  <main class="preview-page">
    <div class="formal-debit-note">
      <header class="dn-header">
        <p class="dn-company-zh">鴻宇有限公司</p>
        <p class="dn-company-en">HONOUR ELITE LIMITED</p>
        <p class="dn-company-meta">(公司地址) · (電話) · (稅務編號)</p>
        <h1 class="dn-title">繳 費 通 知 單</h1>
        <p class="dn-subtitle">DEBIT NOTE</p>
      </header>
      <div class="dn-meta">
        <div class="dn-meta-left">
          <p><span class="dn-label">致 (To):</span> <span class="dn-value-strong">Tenant</span></p>
          <p><span class="dn-label">物業 (Premises):</span> 213A</p>
        </div>
        <div class="dn-meta-right">
          <p><span class="dn-label">單據編號 (Note No.):</span> <span class="dn-value-strong">DN-202607-0001</span></p>
          <p><span class="dn-label">發單日期 (Date):</span> 08/07/2026</p>
          <p><span class="dn-label">到期繳款日 (Due Date):</span> <span class="dn-value-strong">15/07/2026</span></p>
        </div>
      </div>
      <section class="dn-section">
        <h2 class="dn-section-title">【第一部份：本期新增費用 (Current Period Charges: 07/2026)】</h2>
        <table class="dn-table">
          <thead>
            <tr>
              <th>項目 / 單位 (Premises)</th>
              <th>費用類別 (Description)</th>
              <th class="dn-th-right">金額 (Amount HK$)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="3" class="dn-empty">本期無未付費用</td></tr>
            <tr class="dn-subtotal-row">
              <td colspan="2">本期小計 (Current Subtotal):</td>
              <td class="dn-td-right">$0.00</td>
            </tr>
          </tbody>
        </table>
      </section>
      <div class="dn-total-box">
        <table>
          <tbody>
            <tr>
              <td>本期應繳費用 (Current Month Charges):</td>
              <td class="dn-amount">HK$ 0.00</td>
            </tr>
            <tr class="dn-total-row">
              <td class="dn-total-label">本期應繳總額 (TOTAL AMOUNT DUE):</td>
              <td class="dn-total-amount">HK$ 0.00</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="dn-footer">
        <h3 class="dn-footer-title">【底部：付款指示與備註 Payment Instructions &amp; Remarks】</h3>
        <pre class="dn-footer-instructions">1. 敬請於到期日 (發單日7日內, 2026年7月15日) 或之前繳清上述款項。
2.
We accept both cheque payment and bank transfer
(Please remark the Note no. DN-202607-0001 on the cheque or in the bank transfer note.)

-

Crossed cheque made payable to "Honour Elite Limited"

-

Bank transfer detail:

-

-</pre>
      </footer>
    </div>
  </main>
</body>
</html>`;
}

export type DebitNoteTemplateDownloadFormat = 'doc' | 'html';

const DOWNLOAD_NAMES: Record<DebitNoteTemplateDownloadFormat, string> = {
  doc: 'Debit-Note-Style-Template.doc',
  html: 'Debit-Note-Style-Template.html',
};

const DOWNLOAD_MIME: Record<DebitNoteTemplateDownloadFormat, string> = {
  doc: 'application/msword',
  html: 'text/html;charset=utf-8',
};

/** Trigger browser download of editable style template (Word-compatible .doc or .html). */
export function downloadDebitNoteStyleTemplate(
  style: DebitNoteStyleTemplate,
  format: DebitNoteTemplateDownloadFormat = 'doc',
): void {
  const html = buildDebitNoteStyleTemplateHtml(style);
  const blob = new Blob(['\ufeff', html], { type: DOWNLOAD_MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = DOWNLOAD_NAMES[format];
  a.click();
  URL.revokeObjectURL(url);
}
