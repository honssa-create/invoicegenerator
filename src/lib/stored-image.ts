import { NextResponse } from 'next/server';
import fs from 'fs';
import { receiptFilePath, receiptContentType } from './receipt';

/** True when the DB value is already a public http(s) URL (R2). */
export function isStoredImageUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

/** Serve a stored image: redirect to R2/remote URL or stream a legacy local file. */
export function imageResponseForStoredPath(
  stored: string,
  sourceUrl?: string | null,
): NextResponse {
  if (isStoredImageUrl(stored)) {
    return NextResponse.redirect(stored.trim(), 302);
  }

  const filePath = receiptFilePath(stored);
  if (!filePath) {
    if (sourceUrl && isStoredImageUrl(sourceUrl)) {
      return NextResponse.redirect(sourceUrl.trim(), 302);
    }
    return NextResponse.json({ error: 'File missing' }, { status: 404 });
  }

  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: {
      'Content-Type': receiptContentType(stored),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
