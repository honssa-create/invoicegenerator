/**
 * Document template hierarchy: Document Type → Company Variant → Template Details.
 * Client-safe config + preview helpers (no DB).
 */
import type { DebitNoteStyleTemplate } from './debit-note-style';
import {
  applyTemplatePlaceholders,
  buildDebitNotePaymentInstructionsText,
  DEBIT_NOTE_COMPANY_PROFILES,
  renderDebitNoteFooterRemark,
  resolveDebitNoteCompanyHeader,
  type DebitNoteCompanyId,
  type DebitNoteCompanyProfile,
  type FormalDebitNote,
} from './rentals';
import { DEFAULT_FOOTER_REMARK_TEMPLATE, DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE } from './rental-templates';

// ---------------------------------------------------------------------------
// Document types (Debit Note first; others reserved)
// ---------------------------------------------------------------------------

export type DocumentTypeId =
  | 'debit_note'
  | 'quotation'
  | 'invoice'
  | 'delivery_note'
  | 'purchase_order'
  | 'shipping_label';

export interface DocumentTypeDef {
  id: DocumentTypeId;
  label: string;
  labelZh: string;
  enabled: boolean;
  description: string;
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  {
    id: 'debit_note',
    label: 'Debit Note',
    labelZh: '繳費通知單',
    enabled: true,
    description: 'Rent payment notice with charges, arrears, and payment instructions.',
  },
  {
    id: 'quotation',
    label: 'Quotation',
    labelZh: '報價單',
    enabled: false,
    description: 'Coming soon.',
  },
  {
    id: 'invoice',
    label: 'Invoice',
    labelZh: '發票',
    enabled: false,
    description: 'Coming soon.',
  },
  {
    id: 'delivery_note',
    label: 'Delivery Note',
    labelZh: '出貨單',
    enabled: false,
    description: 'Coming soon.',
  },
  {
    id: 'purchase_order',
    label: 'Purchase Order',
    labelZh: '採購單',
    enabled: false,
    description: 'Coming soon.',
  },
  {
    id: 'shipping_label',
    label: 'Shipping Label',
    labelZh: '運送標籤',
    enabled: false,
    description: 'Coming soon.',
  },
];

// ---------------------------------------------------------------------------
// Company variants (Debit Note)
// ---------------------------------------------------------------------------

export type TemplateCompanyVariantId = 'label' | 'elite' | 'joint';

export interface TemplateCompanyVariantDef {
  id: TemplateCompanyVariantId;
  label: string;
  shortLabel: string;
}

export const DEBIT_NOTE_COMPANY_VARIANTS: TemplateCompanyVariantDef[] = [
  { id: 'label', label: 'Honour Label Limited 鴻宇商標有限公司', shortLabel: 'Honour Label' },
  { id: 'elite', label: 'Honour Elite Limited 鴻宇酒莊', shortLabel: 'Honour Elite' },
  {
    id: 'joint',
    label: 'Honour Label Limited & Honour Elite Limited (Joint)',
    shortLabel: 'Joint 聯合',
  },
];

export function isTemplateCompanyVariantId(value: string): value is TemplateCompanyVariantId {
  return value === 'label' || value === 'elite' || value === 'joint';
}

/** Runtime debit-note company ids for preview / document generation. */
export function variantToCompanyIds(variant: TemplateCompanyVariantId): DebitNoteCompanyId[] {
  if (variant === 'joint') return ['label', 'elite'];
  return [variant];
}

export function paymentTemplateIdForVariant(variant: TemplateCompanyVariantId): DebitNoteCompanyId {
  return variant === 'elite' ? 'elite' : 'label';
}

// ---------------------------------------------------------------------------
// Stored JSON shape (layout + content per variant)
// ---------------------------------------------------------------------------

export interface DocumentTemplateHeaderConfig {
  company: Partial<DebitNoteCompanyProfile>;
}

export interface DocumentTemplateNotesConfig {
  paymentInstructions: string;
  footerRemark: string;
  rentInvoiceNote?: string;
}

/** Full editable template payload for one document type + company variant. */
export interface DocumentTemplateConfig {
  documentType: DocumentTypeId;
  companyVariant: TemplateCompanyVariantId;
  layout: DebitNoteStyleTemplate;
  header: DocumentTemplateHeaderConfig;
  notes: DocumentTemplateNotesConfig;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Template variables (interpolation in notes / footer)
// ---------------------------------------------------------------------------

export interface TemplateVariableDef {
  key: string;
  label: string;
  sample: string;
}

export const DEBIT_NOTE_TEMPLATE_VARIABLES: TemplateVariableDef[] = [
  { key: 'noteNo', label: 'Debit note number', sample: 'DN-202607-0001' },
  { key: 'dueDateChinese', label: 'Due date (Chinese)', sample: '2026年7月15日' },
  { key: 'dueDate', label: 'Due date', sample: '15/07/2026' },
  { key: 'chequePayee', label: 'Cheque payee', sample: 'HONOUR LABEL LIMITED' },
  { key: 'bankLines', label: 'Bank transfer lines', sample: '374-279610-001\nHONOUR LABEL LIMITED' },
  { key: 'customer_name', label: 'Tenant / customer name', sample: '陳先生' },
  { key: 'total_amount', label: 'Grand total (HKD)', sample: '1,500.00' },
  { key: 'chargeLabel', label: 'Charge label', sample: '07/2026 租金' },
  { key: 'amount', label: 'Amount', sample: '$1,500.00' },
  { key: 'manualRemark', label: 'Manual remark', sample: '' },
];

export function debitNoteSampleVariables(
  variant: TemplateCompanyVariantId,
  overrides?: Partial<Record<string, string>>,
): Record<string, string> {
  const companyIds = variantToCompanyIds(variant);
  const header = resolveDebitNoteCompanyHeader(companyIds);
  const base: Record<string, string> = {
    noteNo: 'DN-202607-0001',
    dueDateChinese: '2026年7月15日',
    dueDate: '15/07/2026',
    chequePayee: header.chequePayee,
    bankLines: variant === 'label'
      ? '374-279610-001\nHONOUR LABEL LIMITED\nHANG SENG BANK (bank code : 024)'
      : variant === 'elite'
        ? '-\n\n-'
        : '374-279610-001 — HONOUR LABEL LIMITED\n-\n— HONOUR ELITE LIMITED',
    customer_name: '陳先生',
    total_amount: '1,500.00',
    chargeLabel: '07/2026 租金',
    amount: '$1,500.00',
    manualRemark: '',
  };
  const merged = { ...base, ...overrides };
  return Object.fromEntries(
    Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function interpolateTemplateText(
  body: string,
  variant: TemplateCompanyVariantId,
  extra?: Partial<Record<string, string>>,
): string {
  return applyTemplatePlaceholders(body, debitNoteSampleVariables(variant, extra));
}

const JOINT_DEFAULT_PAYMENT = DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE.replace(
  '{{bankLines}}',
  'Honour Label Limited:\n374-279610-001\nHONOUR LABEL LIMITED\nHANG SENG BANK (bank code : 024)\n\nHonour Elite Limited:\n-\n-',
);

export function defaultJointCompanyProfile(): Partial<DebitNoteCompanyProfile> {
  const label = DEBIT_NOTE_COMPANY_PROFILES.label;
  const elite = DEBIT_NOTE_COMPANY_PROFILES.elite;
  return {
    nameZh: `${label.nameZh} / ${elite.nameZh}`,
    nameEn: `${label.nameEn} / ${elite.nameEn}`,
    address: label.address,
    phone: label.phone,
    taxId: label.taxId,
    chequePayee: `${label.chequePayee} / ${elite.chequePayee}`,
  };
}

export interface DebitNoteNotesDraft {
  paymentInstructions: string;
  footerRemark: string;
  company: Partial<DebitNoteCompanyProfile>;
}

export function buildDebitNotePreviewDocument(
  variant: TemplateCompanyVariantId,
  notes: DebitNoteNotesDraft,
  style?: DebitNoteStyleTemplate,
): FormalDebitNote {
  const companyIds = variantToCompanyIds(variant);
  const resolved = resolveDebitNoteCompanyHeader(companyIds);
  const company = {
    ...resolved,
    nameZh: notes.company.nameZh?.trim() || resolved.nameZh,
    nameEn: notes.company.nameEn?.trim() || resolved.nameEn,
    address: notes.company.address?.trim() || resolved.address,
    phone: notes.company.phone?.trim() || resolved.phone,
    taxId: notes.company.taxId?.trim() || resolved.taxId,
    chequePayee: notes.company.chequePayee?.trim() || resolved.chequePayee,
  };
  const vars = debitNoteSampleVariables(variant, { chequePayee: company.chequePayee });
  const paymentInstructionsText = buildDebitNotePaymentInstructionsText(
    paymentTemplateIdForVariant(variant),
    vars.noteNo,
    vars.dueDateChinese,
    null,
    notes.paymentInstructions,
    notes.company,
  );
  const footerRemark = renderDebitNoteFooterRemark(
    interpolateTemplateText(notes.footerRemark, variant),
    '2026-07',
    vars.dueDate,
    [],
    1500,
  );
  const unitName = variant === 'elite' ? '213A' : variant === 'joint' ? '204 + 213A' : '204';

  return {
    noteNo: vars.noteNo,
    issuedDate: '2026-07-08',
    issuedDateDisplay: '08/07/2026',
    dueDate: '2026-07-15',
    dueDateDisplay: vars.dueDate,
    tenant: {
      id: 0,
      user_id: 0,
      name: vars.customer_name,
      phone: '9123 4567',
      email: 'tenant@example.com',
      notes: '',
      utilityBillingMode: 'company_shared_meter',
      created_at: '',
      updated_at: '',
    },
    premises: unitName,
    targetPeriod: '2026-07',
    targetPeriodLabel: '07/2026',
    company,
    currentCharges: [
      {
        unitName: 'RM 204',
        description: '07/2026 租金',
        amount: 12000,
        chargeType: 'rent',
      },
      {
        unitName: 'RM 204',
        description: '07/2026 電費',
        amount: 350,
        chargeType: 'electricity',
      },
    ],
    currentSubtotal: 12350,
    arrearRows: [],
    settledPeriodsNote: null,
    totalArrears: 0,
    grandTotal: 12350,
    footerRemark,
    paymentInstructions: paymentInstructionsText.split('\n').filter((l) => l !== ''),
    paymentInstructionsText,
    paymentTemplateId: paymentTemplateIdForVariant(variant),
    companyIds,
    units: companyIds.map((id, i) => ({
      id: i,
      unitName: id === 'label' ? '204' : '213A',
      utilityBillingMode: 'company_shared_meter' as const,
      billingCompany: id,
    })),
  };
}

export function defaultDebitNoteNotesDraft(variant: TemplateCompanyVariantId): DebitNoteNotesDraft {
  if (variant === 'joint') {
    return {
      paymentInstructions: JOINT_DEFAULT_PAYMENT,
      footerRemark: DEFAULT_FOOTER_REMARK_TEMPLATE,
      company: defaultJointCompanyProfile(),
    };
  }
  const profile = DEBIT_NOTE_COMPANY_PROFILES[variant];
  const bankLines = variant === 'label'
    ? '374-279610-001\nHONOUR LABEL LIMITED\nHANG SENG BANK (bank code : 024)'
    : '-\n\n-';
  return {
    paymentInstructions: DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE.replace('{{bankLines}}', bankLines),
    footerRemark: DEFAULT_FOOTER_REMARK_TEMPLATE,
    company: { ...profile },
  };
}
