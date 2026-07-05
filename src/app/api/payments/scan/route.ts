import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { saveReceipt, ocrImageText } from '@/lib/receipt';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const PROMPT = `You are reading a payment receipt / bank transfer screenshot (Hong Kong: HSBC 匯豐, BOC 中銀, Hang Seng 恒生, PayMe, FPS 轉數快, Alipay, WeChat Pay, etc.).
Return ONLY JSON with these keys (use null when not present):
{"payment_date":"YYYY-MM-DD"|null,"amount":number|null,"bank":string|null,"method":string|null,"reference":string|null}
- payment_date: the transaction date. amount: the paid amount (number only).
- bank: the bank or platform (e.g. 匯豐/HSBC, 中銀, PayMe, FPS). method: e.g. FPS轉數快, Bank Transfer, PayMe, Credit Card.
- reference: the reference / transaction / 流水 number. Do not invent values.`;

async function geminiExtract(base64: string, mimeType: string) {
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
    const p = JSON.parse(text);
    return {
      payment_date: p.payment_date ? String(p.payment_date) : null,
      amount: typeof p.amount === 'number' ? p.amount : p.amount ? Number(String(p.amount).replace(/[^0-9.]/g, '')) : null,
      bank: p.bank ? String(p.bank) : null,
      method: p.method ? String(p.method) : null,
      reference: p.reference ? String(p.reference) : null,
    };
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
function ocrExtractPayment(text: string) {
  // Date
  let payment_date: string | null = null;
  let m = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) payment_date = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  else {
    m = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) payment_date = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  // Amount: prefer a value near HK$/$/amount keyword, else largest decimal.
  let amount: number | null = null;
  const amtCtx = text.match(/(?:HK\$|\$|amount|金額|銀碼)\s*([0-9][0-9,]*\.?\d{0,2})/i);
  if (amtCtx) amount = Number(amtCtx[1].replace(/,/g, ''));
  if (amount === null) {
    const nums = (text.match(/\d[\d,]*\.\d{2}/g) || []).map((s) => Number(s.replace(/,/g, '')));
    if (nums.length) amount = Math.max(...nums);
  }
  // Bank / platform
  const banks = ['匯豐', 'HSBC', '中銀', 'BOC', '恒生', 'Hang Seng', 'PayMe', 'FPS', '轉數快', 'Alipay', '支付寶', 'WeChat', '微信'];
  const bank = banks.find((b) => new RegExp(b, 'i').test(text)) || null;
  // Method
  const method = /轉數快|FPS/i.test(text) ? 'FPS 轉數快' : /PayMe/i.test(text) ? 'PayMe' : /transfer|轉賬|轉帳/i.test(text) ? 'Bank Transfer' : null;
  // Reference
  let reference: string | null = null;
  const ref = text.match(/(?:ref(?:erence)?|參考|交易|流水)[^\dA-Za-z]{0,6}([A-Za-z0-9]{6,})/i);
  if (ref) reference = ref[1];
  return { payment_date, amount, bank, method, reference };
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
  const file = formData.get('receipt');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No receipt uploaded' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Upload a PNG, JPG or WEBP image' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const receiptPath = await saveReceipt(buffer, file.type, file.name);

  const ai = await geminiExtract(buffer.toString('base64'), file.type);
  if (ai) return NextResponse.json({ result: { ...ai, receipt_path: receiptPath, source: 'ai' } });

  let text = '';
  try {
    text = await ocrImageText(buffer);
  } catch {
    text = '';
  }
  return NextResponse.json({ result: { ...ocrExtractPayment(text), receipt_path: receiptPath, source: 'ocr' } });
}
