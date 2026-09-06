const QB_CALLBACK_SUFFIX = '/api/integrations/quickbooks/callback';

function parseOrigin(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function originFromRedirectUri(redirectUri: string | undefined | null): string | null {
  const trimmed = redirectUri?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/$/, '');
    if (path === QB_CALLBACK_SUFFIX) return url.origin;
  } catch {
    /* ignore */
  }
  return null;
}

/** Public site origin for redirects behind reverse proxies (e.g. Railway). */
export function getPublicOrigin(
  request: Request,
  options?: { savedRedirectUri?: string }
): string {
  const fromAppUrl = parseOrigin(process.env.APP_URL);
  if (fromAppUrl) return fromAppUrl;

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    if (host) return `${proto}://${host}`;
  }

  const fromSaved = originFromRedirectUri(options?.savedRedirectUri);
  if (fromSaved) return fromSaved;

  return new URL(request.url).origin;
}
