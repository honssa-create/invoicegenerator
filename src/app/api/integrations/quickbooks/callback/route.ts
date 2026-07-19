import { NextResponse } from 'next/server';
import { exchangeQuickBooksCode, quickbooksRedirectUri, saveQuickBooksTokens } from '@/lib/hub-sync';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  const error = url.searchParams.get('error');

  const redirectBase = new URL('/hub', url.origin);

  if (error) {
    redirectBase.searchParams.set('qb_error', error);
    return NextResponse.redirect(redirectBase);
  }

  if (!code || !state || !realmId) {
    redirectBase.searchParams.set('qb_error', 'missing_oauth_params');
    return NextResponse.redirect(redirectBase);
  }

  let userId: number;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { userId: number };
    userId = parsed.userId;
  } catch {
    redirectBase.searchParams.set('qb_error', 'invalid_state');
    return NextResponse.redirect(redirectBase);
  }

  try {
    const redirectUri = quickbooksRedirectUri(url.origin);
    const tokens = await exchangeQuickBooksCode(code, redirectUri);
    saveQuickBooksTokens(userId, { ...tokens, realmId });
    redirectBase.searchParams.set('connected', 'quickbooks');
    return NextResponse.redirect(redirectBase);
  } catch (err) {
    redirectBase.searchParams.set('qb_error', err instanceof Error ? err.message : 'token_exchange_failed');
    return NextResponse.redirect(redirectBase);
  }
}
