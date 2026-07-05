import { NextResponse } from 'next/server';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSessionFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: requireEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

function safeFilename(original: string): string {
  const trimmed = original.trim() || 'upload';
  const ext = pathExt(trimmed);
  const base = trimmed
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80) || 'upload';
  return `${Date.now()}-${base}${ext}`;
}

function pathExt(name: string): string {
  const match = name.match(/(\.[a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function publicObjectUrl(filename: string): string {
  const base = requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '');
  return `${base}/invoices/${filename}`;
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 });
    }

    const filename = safeFilename(file.name);
    const key = `invoices/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: requireEnv('R2_BUCKET_NAME'),
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    return NextResponse.json({ url: publicObjectUrl(filename) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    const status = message.startsWith('Missing environment variable') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
