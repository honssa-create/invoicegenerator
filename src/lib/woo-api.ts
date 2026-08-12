/** Parse WooCommerce REST API responses safely. */

/** Headers only — SiteGround/WAF blocks Basic Auth and bot-like User-Agents on /wp-json. */
export function wooRequestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    // Use a normal browser UA: "InvoiceFlow/1.0" was getting HTML 403 from nestiee (nginx) on Railway.
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
}

/** WooCommerce REST supports key/secret as query params (same as the browser Hub import path). */
export function appendWooQueryAuth(params: URLSearchParams, key: string, secret: string): void {
  params.set('consumer_key', key);
  params.set('consumer_secret', secret);
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
