import type { DebitNoteCompanyProfile } from './rentals';

export interface RentalDocumentTemplate {
  id: number;
  userId: number;
  templateKey: string;
  name: string;
  paymentInstructions: string;
  footerRemark: string;
  rentInvoiceNote: string;
  company: Partial<DebitNoteCompanyProfile> | null;
  updatedAt: string;
  createdAt: string;
}

export const DEFAULT_PAYMENT_INSTRUCTIONS_TEMPLATE = `1. 敬請於到期日 (發單日7日內, {{dueDateChinese}}) 或之前繳清上述款項。
2.
We accept both cheque payment and bank transfer
(Please remark the Note no. {{noteNo}} on the cheque or in the bank transfer note.)

-

Crossed cheque made payable to "{{chequePayee}}"

-

Bank transfer detail:

{{bankLines}}{{manualRemark}}`;

export const DEFAULT_FOOTER_REMARK_TEMPLATE = `請於 {{dueDate}}前繳交 {{chargeLabel}}，總計 {{amount}}`;

export const DEFAULT_RENT_INVOICE_NOTE = `請於到期日前繳付租金。Please settle by the due date.`;
