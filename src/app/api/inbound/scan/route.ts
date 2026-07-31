import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { saveReceipt, ocrImageText } from '@/lib/receipt';
import type { ShipmentScanResult } from '@/lib/inbound';
import { extractFieldsFromBoxes, hasAnyInboundField, ocrExtractFields } from '@/lib/inbound-ocr';
import { paddleOcrBoxes } from '@/lib/paddle-ocr';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

type ScanFields = Pick<ShipmentScanResult, 'waybill_number' | 'sender' | 'sender_address' | 'receiver_address'>;

const PROMPT = `You are reading a courier / logistics shipping label (e.g. SF Express 順豐, or other couriers).
Extract these fields and return ONLY JSON:
{"waybill_number": string|null, "sender": string|null, "sender_address": string|null, "receiver_address": string|null}.
- waybill_number: the tracking / waybill number (運單號) printed on the label (may look like SF followed by digits, or a long digit string).
- sender: the sender's name or company (寄件人名稱/公司) — name only, not the address.
- sender_address: the sender's full address (寄件地址 / 发件地址). Keep line breaks if multi-line. Do not include phone numbers unless they are part of the address block.
- receiver_address: the receiver's full address (收件地址 / 收方地址). Keep line breaks if multi-line.
Return null for anything you cannot read. Do not invent values. Prefer simplified or traditional Chinese text exactly as printed.`;

function strOrNull(v: unknown, max = 240): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

async function geminiExtract(base64: string, mimeType: string): Promise<ScanFields | null> {
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
      waybill_number: strOrNull(parsed.waybill_number, 64),
      sender: strOrNull(parsed.sender, 80),
      sender_address: strOrNull(parsed.sender_address),
      receiver_address: strOrNull(parsed.receiver_address),
    };
  } catch {
    return null;
  }
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
  const photoPath = await saveReceipt(buffer, file.type, file.name);

  // 1) PaddleOCR sidecar (privacy-first when configured)
  const boxes = await paddleOcrBoxes(buffer, file.type);
  if (boxes) {
    const paddleFields = extractFieldsFromBoxes(boxes);
    if (hasAnyInboundField(paddleFields)) {
      return NextResponse.json({
        result: { ...paddleFields, photo_path: photoPath, source: 'paddle' } satisfies ShipmentScanResult,
      });
    }
  }

  // 2) Gemini (optional cloud)
  const ai = await geminiExtract(buffer.toString('base64'), file.type);
  if (ai) {
    return NextResponse.json({ result: { ...ai, photo_path: photoPath, source: 'ai' } satisfies ShipmentScanResult });
  }

  // 3) tesseract.js + regex
  let text = '';
  try {
    text = await ocrImageText(buffer);
  } catch {
    text = '';
  }
  const fields = ocrExtractFields(text);
  return NextResponse.json({ result: { ...fields, photo_path: photoPath, source: 'ocr' } satisfies ShipmentScanResult });
}
