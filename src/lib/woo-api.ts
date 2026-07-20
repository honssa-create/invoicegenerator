/** Parse WooCommerce REST API responses safely. */

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
      }. Check the store URL is correct (https://nestiee.com.hk), WooCommerce REST API is enabled, and the API key has Read permission.`
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
    return `${platform}: store returned HTML (${status}) — check store URL and API key permissions`;
  }
  return `WooCommerce ${platform} API error (${status}): ${body.slice(0, 200)}`;
}
