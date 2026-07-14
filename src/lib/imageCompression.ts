// Client-side image compression. Runs entirely in the browser (canvas) before an
// image is uploaded, to keep server disk usage small and uploads snappy.

export interface CompressOptions {
  maxDim?: number; // max width/height in px
  targetBytes?: number; // desired max output size
  mimeType?: 'image/jpeg' | 'image/webp';
  quality?: number; // starting JPEG quality (0..1); auto-reduced further if over target
}

export interface CompressResult {
  file: File;
  compressed: boolean;
  originalBytes: number;
  outputBytes: number;
}

// Standard Quality (default): ~1600px on the longest edge, high compression,
// output clean JPEG. Canvas re-encoding also drops source metadata (e.g. EXIF).
const DEFAULTS: Required<CompressOptions> = {
  maxDim: 1600,
  targetBytes: 300 * 1024,
  mimeType: 'image/jpeg',
  quality: 0.85,
};

export async function compressImage(file: File, options: CompressOptions = {}): Promise<CompressResult> {
  const { maxDim, targetBytes, mimeType, quality: startQuality } = { ...DEFAULTS, ...options };
  const original = { file, compressed: false, originalBytes: file.size, outputBytes: file.size };

  // Only handle raster images; skip animated GIFs (re-encoding would flatten them).
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return original;
  if (typeof document === 'undefined') return original;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return original;
    }
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return original;
  }

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  let w = Math.max(1, Math.round(bitmap.width * scale));
  let h = Math.max(1, Math.round(bitmap.height * scale));

  const render = (cw: number, ch: number) => {
    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bitmap, 0, 0, cw, ch);
  };
  const toBlob = (q: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), mimeType, q));

  render(w, h);
  let quality = startQuality;
  let blob = await toBlob(quality);
  while (blob && blob.size > targetBytes && quality > 0.4) {
    quality = Math.round((quality - 0.1) * 100) / 100;
    blob = await toBlob(quality);
  }

  // Still too large? Progressively shrink dimensions and retry.
  let guard = 0;
  while (blob && blob.size > targetBytes && guard < 5 && Math.max(w, h) > 400) {
    w = Math.round(w * 0.8);
    h = Math.round(h * 0.8);
    render(w, h);
    quality = 0.7;
    blob = await toBlob(quality);
    while (blob && blob.size > targetBytes && quality > 0.4) {
      quality = Math.round((quality - 0.1) * 100) / 100;
      blob = await toBlob(quality);
    }
    guard++;
  }

  bitmap.close?.();

  if (!blob) return original;

  // If compression didn't actually help (e.g. tiny source), keep the original.
  if (blob.size >= file.size && Math.max(bitmap.width, bitmap.height) <= maxDim) {
    return original;
  }

  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  const out = new File([blob], `${base}.${ext}`, { type: mimeType, lastModified: Date.now() });
  return { file: out, compressed: true, originalBytes: file.size, outputBytes: out.size };
}
