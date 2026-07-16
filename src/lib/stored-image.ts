import { NextResponse } from 'next/server';
import fs from 'fs';
import { receiptFilePath, receiptContentType } from './receipt';
import { isStoredImageUrl } from './image-url';
import { isR2Configured, r2KeyFromPublicUrl, streamR2Object } from './r2';

async function streamRemoteImage(url: string): Promise<NextResponse | null> {
  try {
    const res = await fetch(url.trim(), {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return null;
  }
}

function imageBytesResponse(body: Uint8Array | Buffer, contentType: string): NextResponse {
  const bytes = Buffer.isBuffer(body) ? new Uint8Array(body) : body;
  return new NextResponse(bytes as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

/** Serve a stored image: stream from R2, disk, or a remote URL fallback. */
export async function imageResponseForStoredPath(
  stored: string,
  sourceUrl?: string | null,
): Promise<NextResponse> {
  const trimmed = stored.trim();

  if (isStoredImageUrl(trimmed)) {
    const r2Key = r2KeyFromPublicUrl(trimmed);
    if (r2Key && isR2Configured()) {
      const obj = await streamR2Object(r2Key);
      if (obj) return imageBytesResponse(obj.body, obj.contentType);
    }

    const remote = await streamRemoteImage(trimmed);
    if (remote) return remote;
  } else {
    const filePath = receiptFilePath(trimmed);
    if (filePath) {
      const file = fs.readFileSync(filePath);
      return imageBytesResponse(file, receiptContentType(trimmed));
    }
  }

  if (sourceUrl && isStoredImageUrl(sourceUrl) && sourceUrl.trim() !== trimmed) {
    return imageResponseForStoredPath(sourceUrl.trim());
  }

  return NextResponse.json({ error: 'File missing' }, { status: 404 });
}
