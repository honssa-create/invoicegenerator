import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { saveReceipt, ocrImageText } from '@/lib/receipt';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const PROMPT = `You are reading a courier / logistics shipping label (e.g. SF Express 順豐, or other couriers).
Extract exactly two things and return ONLY JSON: {"waybill_number": string|null, "sender": string|null}.
- waybill_number: the tracking / waybill number (運單號) printed on the label (may look like SF followed by digits, or a long digit string).
- sender: the sender's name or company (寄件人名稱/公司).
Return null for anything you cannot read. Do not invent values.`;

async function geminiExtract(base64: string, mimeType: string): Promise<{ waybill_number: string | null; sender: string | null } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    return {
      waybill_number: parsed.waybill_number ? String(parsed.waybill_number) : null,
      sender: parsed.sender ? String(parsed.sender) : null,
    };
  } catch {
    return null;
  }
}

function ocrExtractFields(text: string): { waybill_number: string | null; sender: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let waybill: string | null = null;
  // SF-style (SF + 10+ digits) or a long digit run typical of waybills.
  const sf = text.match(/\bSF\s?\d[\d\s]{8,}\b/i);
  if (sf) waybill = sf[0].replace(/\s+/g, '');
  if (!waybill) {
    const digits = text.match(/\b\d{10,16}\b/);
    if (digits) waybill = digits[0];
  }
  // Sender: look for a line mentioning 寄件 / sender / from.
  let sender: string | null = null;
  for (const line of lines) {
    const m = line.match(/(?:寄件人?|sender|from)\s*[:：]?\s*(.+)/i);
    if (m && m[1].trim().length >= 2) {
      sender = m[1].trim().slice(0, 80);
      break;
    }
  }
  return { waybill_number: waybill, sender };
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = formData.get('photo');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Upload a PNG, JPG or WEBP image' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const photoPath = saveReceipt(buffer, file.type);

  const ai = await geminiExtract(buffer.toString('base64'), file.type);
  if (ai) {
    return NextResponse.json({ result: { ...ai, photo_path: photoPath, source: 'ai' } });
  }

  let text = '';
  try {
    text = await ocrImageText(buffer);
  } catch {
    text = '';
  }
  const fields = ocrExtractFields(text);
  return NextResponse.json({ result: { ...fields, photo_path: photoPath, source: 'ocr' } });
}
