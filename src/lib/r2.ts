import crypto from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const ALLOWED_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL,
  );
}

export function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: requireEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

function pathExt(name: string): string {
  const match = name.match(/(\.[a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

export function safeUploadFilename(originalName: string, mimeType: string): string {
  const ext = ALLOWED_EXT[mimeType] || pathExt(originalName) || '.jpg';
  const base = (originalName || 'upload')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 60) || 'upload';
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}${ext}`;
}

export function publicObjectUrl(key: string): string {
  const base = requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  return `${base}/${key.replace(/^\//, '')}`;
}

/** Extract the R2 object key when `stored` is our public bucket URL. */
export function r2KeyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!base) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith(`${base}/`)) return null;
  const key = trimmed.slice(base.length + 1);
  if (!key || key.includes('..')) return null;
  return key;
}

/** Stream an object from R2 using S3 credentials (works even when the public URL is misconfigured). */
export async function streamR2Object(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!isR2Configured()) return null;
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  try {
    const out = await getR2Client().send(
      new GetObjectCommand({
        Bucket: requireEnv('R2_BUCKET_NAME'),
        Key: key,
      }),
    );
    if (!out.Body) return null;
    return {
      body: await out.Body.transformToByteArray(),
      contentType: out.ContentType || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

export function warnIfR2Misconfigured(): void {
  if (!isR2Configured()) return;
  const endpoint = process.env.R2_ENDPOINT?.trim() || '';
  if (/r2\.dev/i.test(endpoint)) {
    console.warn(
      '[InvoiceFlow] R2_ENDPOINT should be the S3 API endpoint ' +
        '(https://<account_id>.r2.cloudflarestorage.com), not the public r2.dev URL.',
    );
  }
  if (!process.env.R2_PUBLIC_URL?.trim()) {
    console.warn('[InvoiceFlow] R2_PUBLIC_URL is missing — receipt paths cannot be resolved.');
  }
}

/** Upload a buffer to R2 and return the public URL. */
export async function uploadBufferToR2(
  buffer: Buffer,
  mimeType: string,
  originalName = 'upload',
  prefix = 'invoices',
): Promise<string> {
  const filename = safeUploadFilename(originalName, mimeType);
  const key = `${prefix}/${filename}`;
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: requireEnv('R2_BUCKET_NAME'),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
  return publicObjectUrl(key);
}
