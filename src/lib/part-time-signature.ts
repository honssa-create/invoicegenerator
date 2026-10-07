export const MAX_SIGNATURE_CHARS = 350_000;

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

/** Accept a reasonably small PNG data URL. Returns the normalized url and decoded bytes. */
export function parseSignatureDataUrl(value: unknown): { dataUrl: string; bytes: Uint8Array } | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s/g, '');
  if (trimmed.length < 80 || trimmed.length > MAX_SIGNATURE_CHARS) return null;
  const match = PNG_DATA_URL.exec(trimmed);
  if (!match) return null;
  let bytes: Uint8Array;
  try {
    const buf = Buffer.from(match[1], 'base64');
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    return null;
  }
  if (bytes.length < 24 || bytes.length > 250_000) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  return { dataUrl: trimmed, bytes };
}
