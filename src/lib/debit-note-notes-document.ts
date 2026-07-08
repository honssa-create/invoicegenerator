import type { RentalDocumentTemplate } from '@/lib/rental-templates';
import {
  DEBIT_NOTE_COMPANY_PROFILES,
  type DebitNoteCompanyId,
  type DebitNoteCompanyProfile,
} from '@/lib/rentals';

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function companyFields(
  companyKey: DebitNoteCompanyId,
  template: Pick<RentalDocumentTemplate, 'company'>,
): DebitNoteCompanyProfile {
  const defaults = DEBIT_NOTE_COMPANY_PROFILES[companyKey];
  const c = template.company ?? {};
  return {
    id: companyKey,
    nameZh: c.nameZh ?? defaults.nameZh,
    nameEn: c.nameEn ?? defaults.nameEn,
    address: c.address ?? defaults.address,
    phone: c.phone ?? defaults.phone,
    taxId: c.taxId ?? defaults.taxId,
    chequePayee: c.chequePayee ?? defaults.chequePayee,
  };
}

/** Self-contained HTML for editing debit note payment notes offline. */
export function buildDebitNoteNotesTemplateHtml(
  companyKey: DebitNoteCompanyId,
  template: Pick<RentalDocumentTemplate, 'paymentInstructions' | 'footerRemark' | 'company' | 'name'>,
): string {
  const company = companyFields(companyKey, template);
  return `<!DOCTYPE html>
<html lang="zh-Hant" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="InvoiceFlow" />
  <title>Debit Note Notes — ${escHtml(company.nameEn)}</title>
  <style>
    body { font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; margin: 2rem; color: #111827; line-height: 1.6; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    pre, .block { white-space: pre-wrap; font-family: inherit; font-size: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0; }
    .hint { font-size: 12px; color: #6b7280; margin-top: 8px; }
    table.info { border-collapse: collapse; width: 100%; max-width: 560px; font-size: 14px; }
    table.info td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    table.info td:first-child { width: 140px; color: #6b7280; }
  </style>
</head>
<body>
  <h1>Debit Note Notes 付款備註範本</h1>
  <p class="meta">${escHtml(template.name || company.nameEn)} · Placeholders: {{noteNo}}, {{dueDateChinese}}, {{chequePayee}}, {{bankLines}}, {{manualRemark}}</p>

  <h2>Company header 公司抬頭</h2>
  <table class="info">
    <tr><td>中文名稱</td><td>${escHtml(company.nameZh)}</td></tr>
    <tr><td>English name</td><td>${escHtml(company.nameEn)}</td></tr>
    <tr><td>Address</td><td>${escHtml(company.address)}</td></tr>
    <tr><td>Phone</td><td>${escHtml(company.phone)}</td></tr>
    <tr><td>Tax ID</td><td>${escHtml(company.taxId)}</td></tr>
    <tr><td>Cheque payee</td><td>${escHtml(company.chequePayee)}</td></tr>
  </table>

  <h2>Payment instructions 付款指示</h2>
  <pre>${escHtml(template.paymentInstructions)}</pre>
  <p class="hint">Edit in Templates section or paste updated text back into the app.</p>

  <h2>Footer remark 底部備註</h2>
  <pre>${escHtml(template.footerRemark)}</pre>
  <p class="hint">Placeholders: {{dueDate}}, {{chargeLabel}}, {{amount}}</p>
</body>
</html>`;
}

export type DebitNoteNotesDownloadFormat = 'doc' | 'html';

const COMPANY_FILE_SLUG: Record<DebitNoteCompanyId, string> = {
  label: 'Honour-Label',
  elite: 'Honour-Elite',
};

export function downloadDebitNoteNotesTemplate(
  companyKey: DebitNoteCompanyId,
  template: Pick<RentalDocumentTemplate, 'paymentInstructions' | 'footerRemark' | 'company' | 'name'>,
  format: DebitNoteNotesDownloadFormat = 'doc',
): void {
  const slug = COMPANY_FILE_SLUG[companyKey];
  const ext = format === 'doc' ? 'doc' : 'html';
  const mime = format === 'doc' ? 'application/msword' : 'text/html;charset=utf-8';
  const html = buildDebitNoteNotesTemplateHtml(companyKey, template);
  const blob = new Blob(['\ufeff', html], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Debit-Note-Notes-${slug}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
