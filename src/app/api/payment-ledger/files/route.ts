import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { readLedgerAttachment } from '@/lib/payment-ledger-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  const index = Number(url.searchParams.get('index'));
  const variant = url.searchParams.get('variant') === 'thumb' ? 'thumb' : 'full';
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  const file = await readLedgerAttachment(ownerId, id, index, variant);
  if ('error' in file) return NextResponse.json({ error: file.error }, { status: file.status });

  // ClickUp attachment bytes are immutable for a given entry id + index.
  // Thumbs are requested once per visible row; a day-long private cache stops the list from re-proxying them.
  const cacheControl =
    variant === 'thumb' ? 'private, max-age=86400' : 'private, max-age=3600';

  return new NextResponse(Buffer.from(file.body), {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
