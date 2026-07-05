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
