/** Client for the PaddleOCR sidecar (server-only). */

export type OcrBox = {
  text: string;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export async function paddleOcrBoxes(
  buffer: Buffer,
  mimeType: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<OcrBox[] | null> {
  const base = (process.env.PADDLE_OCR_URL || '').replace(/\/$/, '');
  if (!base) return null;

  const secret = (process.env.PADDLE_OCR_SECRET || '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Paddle-OCR-Secret'] = secret;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/ocr/json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_base64: buffer.toString('base64'),
        mime_type: mimeType,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { boxes?: OcrBox[] };
    if (!Array.isArray(json.boxes)) return null;
    return json.boxes.map((b) => ({
      text: String(b.text || '').trim(),
      score: typeof b.score === 'number' ? b.score : 1,
      x0: Number(b.x0) || 0,
      y0: Number(b.y0) || 0,
      x1: Number(b.x1) || 0,
      y1: Number(b.y1) || 0,
    })).filter((b) => b.text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
