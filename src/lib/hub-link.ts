/** Pure helpers for matching QuickBooks invoices to hub orders. */

export function normalizeOrderRef(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

/** Extract NES-/HON-/CUP-/QB- style refs from free text (e.g. QB memo or doc number). */
export function extractSystemOrderRef(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\b((?:NES|HON|CUP|QB)-\d+)\b/i);
  return match ? match[1].toUpperCase() : null;
}

export interface HubOrderMatchCandidate {
  id: number;
  po_number: string | null;
  system_order_no: string | null;
  customer_name: string | null;
  total_amount: number | null;
  created_at: string;
}

export function scoreHubOrderMatch(
  candidate: HubOrderMatchCandidate,
  input: {
    docNumber?: string | null;
    customerName?: string | null;
    totalAmount?: number | null;
    txnDate?: string | null;
  }
): number {
  let score = 0;
  const doc = normalizeOrderRef(input.docNumber);
  const po = normalizeOrderRef(candidate.po_number);
  const systemNo = normalizeOrderRef(candidate.system_order_no);

  if (doc) {
    if (doc === po || doc === systemNo) score += 100;
    const embedded = extractSystemOrderRef(input.docNumber);
    if (embedded && embedded.toLowerCase() === systemNo) score += 90;
    if (po && (doc.includes(po) || po.includes(doc))) score += 40;
  }

  const embeddedInDoc = extractSystemOrderRef(input.docNumber);
  if (embeddedInDoc && embeddedInDoc.toLowerCase() === systemNo) score += 80;

  const customer = normalizeOrderRef(input.customerName);
  const candidateCustomer = normalizeOrderRef(candidate.customer_name);
  if (customer && candidateCustomer && customer === candidateCustomer) score += 20;

  const total = Number(input.totalAmount) || 0;
  const candidateTotal = Number(candidate.total_amount) || 0;
  if (total > 0 && Math.abs(total - candidateTotal) < 0.01) score += 25;

  if (input.txnDate && candidate.created_at) {
    const txn = new Date(input.txnDate.slice(0, 10)).getTime();
    const created = new Date(candidate.created_at.slice(0, 10)).getTime();
    const days = Math.abs(txn - created) / (24 * 60 * 60 * 1000);
    if (days <= 3) score += 15;
    else if (days <= 14) score += 5;
  }

  return score;
}

export function pickBestHubOrderMatch(
  candidates: HubOrderMatchCandidate[],
  input: {
    docNumber?: string | null;
    customerName?: string | null;
    totalAmount?: number | null;
    txnDate?: string | null;
  },
  minScore = 40
): HubOrderMatchCandidate | null {
  let best: HubOrderMatchCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreHubOrderMatch(candidate, input);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= minScore ? best : null;
}
