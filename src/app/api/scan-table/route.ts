import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { ocrImageText } from '@/lib/receipt';

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const PDF_TYPE = 'application/pdf';

const PROMPT = `You are a precise data extraction engine. Read the table in this document/image and
return the tabular data as JSON with this exact shape: {"table": [["Header1","Header2"],["r1c1","r1c2"]]}.
Rules: include the header row as the first array; keep the original text of each cell; do not invent, merge,
or reorder columns; output every row you can read; return ONLY valid JSON, no markdown, no commentary.`;

async function geminiExtract(base64: string, mimeType: string): Promise<string[][] | null> {
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
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    const table = Array.isArray(parsed) ? parsed : parsed.table;
    if (!Array.isArray(table)) return null;
    return table.map((row: unknown) =>
      Array.isArray(row) ? row.map((c) => (c == null ? '' : String(c))) : [String(row)]
    );
  } catch {
    return null;
  }
}

function ocrToTable(text: string): string[][] {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => l.trim().length);
  // Prefer splitting on tabs / 2+ spaces / pipes (real column gaps). If that yields
  // only a single column (OCR often collapses gaps to single spaces), fall back to
  // splitting on any whitespace so the user gets an editable grid to correct.
  let rows = lines.map((l) => l.split(/\t|\s{2,}|\s*\|\s*/).map((c) => c.trim()).filter((c) => c.length));
  const maxW = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (maxW <= 1) {
    rows = lines.map((l) => l.split(/\s+/).map((c) => c.trim()).filter((c) => c.length));
  }
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push('');
    return copy;
  });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 400 });
  }
  const isImage = IMAGE_TYPES.includes(file.type);
  const isPdf = file.type === PDF_TYPE;
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'Upload a JPG, PNG or PDF file' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  const aiTable = await geminiExtract(base64, file.type);
  if (aiTable) {
    return NextResponse.json({ table: aiTable, source: 'ai' });
  }

  if (isPdf) {
    return NextResponse.json(
      {
        table: [],
        source: 'none',
        message:
          'PDF parsing requires the GEMINI_API_KEY. Upload an image, or set the key to enable AI vision on PDFs.',
      },
      { status: 200 }
    );
  }

  try {
    const text = await ocrImageText(buffer);
    return NextResponse.json({ table: ocrToTable(text), source: 'ocr' });
  } catch {
    return NextResponse.json({ error: 'Could not read the image' }, { status: 500 });
  }
}
