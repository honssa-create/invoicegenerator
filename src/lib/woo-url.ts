export type WooUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Normalize and validate a WooCommerce store URL. */
export function normalizeWooStoreUrl(raw: string): WooUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Store URL is required' };

  if (trimmed.includes('@') && !/^https?:\/\//i.test(trimmed)) {
    return {
      ok: false,
      error:
        'Store URL must be a website address like https://nestiee.com.hk — not an email address. Check Settings → API Integrations.',
    };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, error: 'Store URL must use http:// or https://' };
    }
    if (!parsed.hostname || parsed.hostname.includes('@')) {
      return { ok: false, error: 'Invalid store URL hostname' };
    }
    return { ok: true, url: `${parsed.protocol}//${parsed.host}` };
  } catch {
    return {
      ok: false,
      error: 'Invalid store URL — use the full website address, e.g. https://nestiee.com.hk',
    };
  }
}

export function formatWooStoreUrlError(platform: string, raw: string, detail?: string): string {
  const normalized = normalizeWooStoreUrl(raw);
  if (!normalized.ok) {
    return `${platform}: ${normalized.error}`;
  }
  return detail || `${platform}: Invalid store URL "${raw}"`;
}
