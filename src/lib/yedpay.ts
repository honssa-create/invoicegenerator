/** Yedpay REST API client (server-only). */

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

export function yedpayConfigured(): boolean {
  return Boolean(process.env.YEDPAY_ACCESS_TOKEN && process.env.YEDPAY_USER_ID);
}

function authHeaders(): HeadersInit {
  const token = process.env.YEDPAY_ACCESS_TOKEN;
  if (!token) throw new Error('YEDPAY_ACCESS_TOKEN is not configured');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

/** Fetch all paid/settled transactions, paginating through Yedpay results. */
export async function fetchYedpayTransactions(options?: {
  since?: string;
  limit?: number;
}): Promise<YedpayTransaction[]> {
  const userId = process.env.YEDPAY_USER_ID;
  if (!userId) throw new Error('YEDPAY_USER_ID is not configured');

  const limit = options?.limit ?? 50;
  const all: YedpayTransaction[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('page', String(page));
    params.set('status', 'paid');
    if (options?.since) {
      params.set('paid_at>=', options.since);
    }

    const url = `https://api.yedpay.com/v1/users/${encodeURIComponent(userId)}/transactions?${params.toString()}`;
    const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
    const json = (await res.json()) as YedpayListResponse;

    if (!res.ok || !json.success) {
      throw new Error(json.message || `Yedpay API error (${res.status})`);
    }

    const batch = json.data || [];
    all.push(...batch);
    totalPages = json.meta?.pagination?.total_pages ?? 1;
    if (!batch.length) break;
    page += 1;
  }

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
