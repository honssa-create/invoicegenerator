import { orderCreatedInRange, wooOrderCreatedBounds, type HubImportDateRange } from './hub-import';

export interface WooOrderPayload {
  id: number;
  number: string;
  status: string;
  total: string;
  date_created: string;
  date_modified?: string;
  customer_note?: string;
  payment_method?: string;
  payment_method_title?: string;
  shipping_total?: string;
  shipping_lines?: {
    method_title?: string;
    method_id?: string;
    total?: string;
  }[];
  billing?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    email?: string;
    phone?: string;
  };
  shipping?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    phone?: string;
  };
  meta_data?: { key?: string; value?: unknown }[];
  line_items?: {
    name: string;
    quantity: number;
    price?: number | string;
    total?: number | string;
    meta_data?: { key?: string; value?: unknown }[];
  }[];
}

function parseOrdersJson(body: string, platform: string): WooOrderPayload[] {
  const trimmed = body.trim();
  if (!trimmed) throw new Error(`${platform}: empty response from store`);
  if (trimmed.startsWith('<')) {
    throw new Error(
      `${platform}: store returned a web page instead of API data. Check Store URL and API keys in Settings.`
    );
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${platform}: unexpected WooCommerce API response`);
  }
  return parsed as WooOrderPayload[];
}

function wooErrorMessage(status: number, body: string, platform: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return `WooCommerce ${platform} (${status}): ${parsed.message}`;
  } catch {
    /* ignore */
  }
  if (body.trim().startsWith('<')) {
    return `${platform}: store returned HTML (${status})`;
  }
  return `WooCommerce ${platform} API error (${status})`;
}

/** Fetch WooCommerce orders from the user's browser (bypasses server IP blocks). */
export async function fetchWooOrdersInBrowser(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  platform: string,
  dateRange: HubImportDateRange
): Promise<WooOrderPayload[]> {
  const base = storeUrl.replace(/\/$/, '');
  const bounds = wooOrderCreatedBounds(dateRange);
  const perPage = 100;
  const all: WooOrderPayload[] = [];
  let page = 1;

  while (page <= 50) {
    const params = new URLSearchParams();
    params.set('consumer_key', consumerKey);
    params.set('consumer_secret', consumerSecret);
    params.set('per_page', String(perPage));
    params.set('page', String(page));
    params.set('orderby', 'date');
    params.set('order', 'asc');
    params.set('after', bounds.after);
    params.set('before', bounds.before);

    const url = `${base}/wp-json/wc/v3/orders?${params.toString()}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        mode: 'cors',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      if (/failed to fetch|cors|network/i.test(msg)) {
        throw new Error(
          `${platform}: browser could not reach the store (${msg}). Ensure ${base} allows cross-origin API access, or contact your web host.`
        );
      }
      throw err;
    }

    const body = await res.text();
    if (!res.ok) throw new Error(wooErrorMessage(res.status, body, platform));

    const batch = parseOrdersJson(body, platform);
    all.push(...batch.filter((o) => orderCreatedInRange(o.date_created, dateRange)));
    if (batch.length < perPage) break;
    page += 1;
  }

  return all;
}

function parseOrderJson(body: string, platform: string): WooOrderPayload | null {
  const trimmed = body.trim();
  if (!trimmed || trimmed.startsWith('<')) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    return first && typeof first === 'object' ? (first as WooOrderPayload) : null;
  }
  if (parsed && typeof parsed === 'object' && typeof (parsed as WooOrderPayload).id === 'number') {
    return parsed as WooOrderPayload;
  }
  return null;
}

async function wooBrowserGet(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  platform: string,
  path: string,
  extra?: URLSearchParams
): Promise<{ ok: boolean; status: number; body: string }> {
  const params = extra ? extra : new URLSearchParams();
  params.set('consumer_key', consumerKey);
  params.set('consumer_secret', consumerSecret);
  const url = `${storeUrl.replace(/\/$/, '')}/wp-json/wc/v3/${path}?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      mode: 'cors',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network error';
    if (/failed to fetch|cors|network/i.test(msg)) {
      throw new Error(
        `${platform}: browser could not reach the store (${msg}). Ensure ${storeUrl.replace(/\/$/, '')} allows cross-origin API access, or contact your web host.`
      );
    }
    throw err;
  }
  return { ok: res.ok, status: res.status, body: await res.text() };
}

/** Fetch specific Woo orders by REST id / order number (e.g. 10667). */
export async function fetchWooOrdersByNumbersInBrowser(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  platform: string,
  numbers: string[]
): Promise<WooOrderPayload[]> {
  const out: WooOrderPayload[] = [];
  const seen = new Set<number>();

  for (const raw of numbers) {
    const token = String(raw || '').trim();
    if (!token) continue;

    let found: WooOrderPayload | null = null;
    if (/^\d+$/.test(token)) {
      const byId = await wooBrowserGet(storeUrl, consumerKey, consumerSecret, platform, `orders/${token}`);
      if (byId.ok) {
        found = parseOrderJson(byId.body, platform);
      } else if (byId.status !== 404) {
        throw new Error(wooErrorMessage(byId.status, byId.body, platform));
      }
    }

    if (!found) {
      const params = new URLSearchParams();
      params.set('search', token);
      params.set('per_page', '20');
      const res = await wooBrowserGet(storeUrl, consumerKey, consumerSecret, platform, 'orders', params);
      if (!res.ok) throw new Error(wooErrorMessage(res.status, res.body, platform));
      const batch = parseOrdersJson(res.body, platform);
      found = batch.find((o) => String(o.number) === token || String(o.id) === token) || null;
    }

    if (!found || seen.has(found.id)) continue;
    seen.add(found.id);
    out.push(found);
  }

  return out;
}
