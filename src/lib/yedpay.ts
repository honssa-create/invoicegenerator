/** Yedpay REST API client (server-only). */

import { getYedpayCredentials } from './integration-settings-server';

export interface YedpayTransaction {
  id: string;
  status: string;
  amount: string;
  charge: number | string;
  net: string;
  custom_id?: string;
  extra_parameters?: string;
  paid_at?: string;
  settled_at?: string;
  created_at?: string;
  transaction_id?: string;
}

interface YedpayListResponse {
  success: boolean;
  data?: YedpayTransaction[];
  message?: string;
  meta?: {
    pagination?: {
      total_pages?: number;
      current_page?: number;
    };
  };
}

export const YEDPAY_PAGE_SIZE = 100;

export type YedpayPageAction = 'continue' | 'stop';

export async function yedpayConfigured(userId?: number): Promise<boolean> {
  if (userId) {
    const creds = await getYedpayCredentials(userId);
    return Boolean(creds.access_token && creds.user_id);
  }
  return Boolean(process.env.YEDPAY_ACCESS_TOKEN && process.env.YEDPAY_USER_ID);
}

async function resolveCreds(userId: number) {
  const creds = await getYedpayCredentials(userId);
  const token = creds.access_token || process.env.YEDPAY_ACCESS_TOKEN;
  const yedpayUserId = creds.user_id || process.env.YEDPAY_USER_ID;
  if (!token || !yedpayUserId) throw new Error('Yedpay is not configured');
  return { token, yedpayUserId };
}

/** Best available paid timestamp for API cursor / filtering (prefer paid_at). */
export function transactionPaidAt(txn: YedpayTransaction): string | null {
  const raw = txn.paid_at?.trim() || txn.settled_at?.trim() || txn.created_at?.trim();
  return raw || null;
}

async function fetchYedpayPage(
  token: string,
  yedpayUserId: string,
  page: number,
  options?: { since?: string; limit?: number },
): Promise<{ batch: YedpayTransaction[]; totalPages: number }> {
  const limit = options?.limit ?? YEDPAY_PAGE_SIZE;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('page', String(page));
  params.set('status', 'paid');
  if (options?.since) {
    params.set('paid_at>=', options.since);
  }

  const url = `https://api.yedpay.com/v1/users/${encodeURIComponent(yedpayUserId)}/transactions?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  const json = (await res.json()) as YedpayListResponse;

  if (!res.ok || !json.success) {
    throw new Error(json.message || `Yedpay API error (${res.status})`);
  }

  return {
    batch: json.data || [],
    totalPages: json.meta?.pagination?.total_pages ?? 1,
  };
}

/**
 * Paginate Yedpay paid transactions (newest pages first).
 * Call `onPage` per batch; return `'stop'` to skip remaining older pages.
 */
export async function forEachYedpayTransactionPage(
  userId: number,
  options: {
    since?: string;
    limit?: number;
    onPage: (batch: YedpayTransaction[], page: number) => Promise<YedpayPageAction>;
  },
): Promise<void> {
  const { token, yedpayUserId } = await resolveCreds(userId);

  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { batch, totalPages: reportedTotal } = await fetchYedpayPage(token, yedpayUserId, page, {
      since: options.since,
      limit: options.limit,
    });
    totalPages = reportedTotal;

    if (!batch.length) break;

    const action = await options.onPage(batch, page);
    if (action === 'stop') break;

    page += 1;
  }
}

/** Fetch all paid transactions (used when a full in-memory list is required). */
export async function fetchYedpayTransactions(
  userId: number,
  options?: { since?: string; limit?: number },
): Promise<YedpayTransaction[]> {
  const all: YedpayTransaction[] = [];
  await forEachYedpayTransactionPage(userId, {
    since: options?.since,
    limit: options?.limit,
    onPage: async (batch) => {
      all.push(...batch);
      return 'continue';
    },
  });
  return all;
}

/** Extract order number from Yedpay custom_id or extra_parameters JSON. */
export function extractOrderNoFromYedpay(txn: YedpayTransaction): string | null {
  const custom = txn.custom_id?.trim();
  if (custom) return custom;

  if (txn.extra_parameters) {
    try {
      const parsed = JSON.parse(txn.extra_parameters) as Record<string, unknown>;
      for (const key of ['order_no', 'orderNo', 'po_number', 'po', 'reference']) {
        const v = parsed[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    } catch {
      /* ignore malformed JSON */
    }
  }

  return null;
}
