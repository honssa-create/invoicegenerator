import db from './db';
import {
  DEBIT_NOTE_COMPANY_PROFILES,
  DEBIT_NOTE_PAYMENT_TEMPLATE_LABELS,
  type DebitNoteCompanyProfile,
  type DebitNotePaymentTemplateId,
} from './rentals';
import {
  defaultDebitNoteNotesDraft,
  defaultJointCompanyProfile,
  type TemplateCompanyVariantId,
} from './document-templates';
import {
  DEFAULT_FOOTER_REMARK_TEMPLATE,
  DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE,
  DEFAULT_RENT_INVOICE_NOTE,
  type RentalDocumentTemplate,
} from './rental-templates';

export type { RentalDocumentTemplate } from './rental-templates';
export {
  DEFAULT_FOOTER_REMARK_TEMPLATE,
  DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE,
  DEFAULT_RENT_INVOICE_NOTE,
} from './rental-templates';

interface TemplateRow {
  id: number;
  user_id: number;
  template_key: string;
  name: string;
  payment_instructions: string;
  footer_remark: string;
  rent_invoice_note: string;
  company_json: string | null;
  updated_at: string;
  created_at: string;
}

const BUILTIN_KEYS: TemplateCompanyVariantId[] = ['label', 'elite', 'joint'];

function defaultBankLines(templateKey: string): string {
  if (templateKey === 'label') {
    return '374-279610-001\nHONOUR LABEL LIMITED\nHANG SENG BANK (bank code : 024)';
  }
  if (templateKey === 'joint') {
    return 'Honour Label Limited:\n374-279610-001\nHONOUR LABEL LIMITED\nHANG SENG BANK (bank code : 024)\n\nHonour Elite Limited:\n-\n-';
  }
  return '-\n\n-';
}

function defaultPaymentInstructions(templateKey: string): string {
  const bankLines = defaultBankLines(templateKey);
  return DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE.replace('{{bankLines}}', bankLines);
}

function hydrate(row: TemplateRow): RentalDocumentTemplate {
  let company: Partial<DebitNoteCompanyProfile> | null = null;
  if (row.company_json) {
    try {
      company = JSON.parse(row.company_json) as Partial<DebitNoteCompanyProfile>;
    } catch {
      company = null;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    templateKey: row.template_key,
    name: row.name,
    paymentInstructions: row.payment_instructions,
    footerRemark: row.footer_remark,
    rentInvoiceNote: row.rent_invoice_note,
    company,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function defaultName(templateKey: string): string {
  if (templateKey === 'label' || templateKey === 'elite') {
    return DEBIT_NOTE_PAYMENT_TEMPLATE_LABELS[templateKey];
  }
  if (templateKey === 'joint') {
    return 'Template — Honour Label & Honour Elite (Joint) 聯合';
  }
  return templateKey;
}

function defaultCompany(templateKey: string): Partial<DebitNoteCompanyProfile> | null {
  if (templateKey === 'label' || templateKey === 'elite') {
    return { ...DEBIT_NOTE_COMPANY_PROFILES[templateKey] };
  }
  if (templateKey === 'joint') {
    return defaultJointCompanyProfile();
  }
  return null;
}

export function ensureDefaultRentalTemplates(userId: number): void {
  for (const key of BUILTIN_KEYS) {
    const existing = db.prepare(
      'SELECT id FROM rental_document_templates WHERE user_id = ? AND template_key = ?'
    ).get(userId, key);
    if (existing) continue;
    const company = defaultCompany(key);
    const draft = defaultDebitNoteNotesDraft(key);
    db.prepare(
      `INSERT INTO rental_document_templates
        (user_id, template_key, name, payment_instructions, footer_remark, rent_invoice_note, company_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      key,
      defaultName(key),
      draft.paymentInstructions,
      draft.footerRemark,
      DEFAULT_RENT_INVOICE_NOTE,
      company ? JSON.stringify(company) : null,
    );
  }
}

export function listRentalTemplates(userId: number): RentalDocumentTemplate[] {
  ensureDefaultRentalTemplates(userId);
  const rows = db.prepare(
    'SELECT * FROM rental_document_templates WHERE user_id = ? ORDER BY template_key'
  ).all(userId) as TemplateRow[];
  return rows.map(hydrate);
}

export function getRentalTemplate(userId: number, templateKey: string): RentalDocumentTemplate | null {
  ensureDefaultRentalTemplates(userId);
  const row = db.prepare(
    'SELECT * FROM rental_document_templates WHERE user_id = ? AND template_key = ?'
  ).get(userId, templateKey) as TemplateRow | undefined;
  return row ? hydrate(row) : null;
}

export function updateRentalTemplate(
  userId: number,
  templateKey: string,
  input: {
    name?: string;
    paymentInstructions?: string;
    footerRemark?: string;
    rentInvoiceNote?: string;
    company?: Partial<DebitNoteCompanyProfile> | null;
  },
): RentalDocumentTemplate {
  ensureDefaultRentalTemplates(userId);
  const existing = getRentalTemplate(userId, templateKey);
  if (!existing) {
    db.prepare(
      `INSERT INTO rental_document_templates
        (user_id, template_key, name, payment_instructions, footer_remark, rent_invoice_note, company_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      templateKey,
      input.name?.trim() || defaultName(templateKey),
      input.paymentInstructions ?? defaultPaymentInstructions(templateKey),
      input.footerRemark ?? DEFAULT_FOOTER_REMARK_TEMPLATE,
      input.rentInvoiceNote ?? DEFAULT_RENT_INVOICE_NOTE,
      input.company ? JSON.stringify(input.company) : null,
    );
    return getRentalTemplate(userId, templateKey)!;
  }
  db.prepare(
    `UPDATE rental_document_templates SET
      name = ?, payment_instructions = ?, footer_remark = ?, rent_invoice_note = ?,
      company_json = ?, updated_at = datetime('now')
     WHERE user_id = ? AND template_key = ?`
  ).run(
    input.name?.trim() || existing.name,
    input.paymentInstructions ?? existing.paymentInstructions,
    input.footerRemark ?? existing.footerRemark,
    input.rentInvoiceNote ?? existing.rentInvoiceNote,
    input.company !== undefined
      ? (input.company ? JSON.stringify(input.company) : null)
      : (existing.company ? JSON.stringify(existing.company) : null),
    userId,
    templateKey,
  );
  return getRentalTemplate(userId, templateKey)!;
}

export function resolveCompanyFromTemplate(
  templateKey: string,
  template: RentalDocumentTemplate | null,
): Partial<DebitNoteCompanyProfile> | null {
  if (template?.company && Object.keys(template.company).length) return template.company;
  if (templateKey === 'label' || templateKey === 'elite') {
    return { ...DEBIT_NOTE_COMPANY_PROFILES[templateKey] };
  }
  if (templateKey === 'joint') {
    return defaultJointCompanyProfile();
  }
  return null;
}
