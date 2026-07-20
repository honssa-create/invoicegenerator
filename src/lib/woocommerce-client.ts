import { orderCreatedInRange, wooOrderCreatedBounds, type HubImportDateRange } from './hub-import';

export interface WooOrderPayload {
  id: number;
  number: string;
  status: string;
  total: string;
  date_created: string;
  date_modified?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  shipping?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items?: { name: string; quantity: number }[];
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
