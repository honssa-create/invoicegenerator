/** Parse WooCommerce REST API responses safely. */

export function wooBasicAuthHeader(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

export function wooRequestHeaders(key: string, secret: string): Record<string, string> {
  return {
    Authorization: wooBasicAuthHeader(key, secret),
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; InvoiceFlow/1.0; +https://invoiceflow.app)',
  };
}

export function parseWooApiJson<T>(body: string, context: string): T {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error(`${context}: empty response from store`);
  }
  if (trimmed.startsWith('<')) {
    const title = trimmed.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    throw new Error(
      `${context}: store returned a web page instead of API data${
        title ? ` (${title})` : ''
      }. Your browser test may work while the server is blocked — check WordPress security/firewall plugins and allow server-to-server API access. Also verify Store URL and API key Read permission in Settings.`
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `${context}: invalid API response — verify the store URL and WooCommerce API credentials in Settings.`
    );
  }
}

export function wooApiErrorMessage(status: number, body: string, platform: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    if (parsed.message) {
      return `WooCommerce ${platform} API error (${status}): ${parsed.message}`;
    }
  } catch {
    /* fall through */
  }
  if (body.trim().startsWith('<')) {
    return `${platform}: store returned HTML (${status}) — your server may be blocked by the store firewall; allow API access from your hosting IP`;
  }
  return `WooCommerce ${platform} API error (${status}): ${body.slice(0, 200)}`;
}
