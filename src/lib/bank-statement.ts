/** Client-safe types for bank statement import & reconciliation. */

export type ReconcileMatchType = 'order' | 'income';

export type ReconcileRowStatus = 'auto_cleared' | 'suggested' | 'unclaimed' | 'skipped';

export interface BankStatementRow {
  txn_date: string;
  description: string;
  deposit_amount: number;
}

export interface ReconcileMatch {
  type: ReconcileMatchType;
  id: number;
  ref: string;
  amount: number;
  date: string;
  rule: 'exact' | 'fuzzy';
}

export interface ReconcileRowResult {
  row: BankStatementRow;
  status: ReconcileRowStatus;
  match?: ReconcileMatch;
  unclaimedId?: number;
}

export interface BankImportSummary {
  total: number;
  autoCleared: number;
  suggested: number;
  unclaimed: number;
  skipped: number;
}

export interface BankImportResponse {
  summary: BankImportSummary;
  results: ReconcileRowResult[];
}

export interface UnclaimedDeposit {
  id: number;
  txn_date: string;
  amount: number;
  description: string;
  created_at: string;
}

export interface ConfirmMatchPayload {
  type: ReconcileMatchType;
  id: number;
  txn_date: string;
  amount: number;
  description: string;
}
