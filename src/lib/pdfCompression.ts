// Client-side heavy-PDF compression. Renders each PDF page to a canvas (preserving
// the page's exact layout / 排版) and re-encodes it as a compressed JPEG, returning a
// lightweight array of page images to store instead of the original large PDF.

export interface PdfCompressOptions {
  quality?: number; // JPEG quality (0..1)
  maxWidthOrHeight?: number; // longest edge of each rendered page, px
}

export const PDF_HEAVY_THRESHOLD = 2 * 1024 * 1024; // 2 MB

const HEAVY: Required<PdfCompressOptions> = { quality: 0.5, maxWidthOrHeight: 1400 };
const STANDARD: Required<PdfCompressOptions> = { quality: 0.7, maxWidthOrHeight: 1600 };

// Choose settings by size: heavy/scanned PDFs (> 2 MB) get aggressive 0.5 / 1400px.
export function pdfOptionsForSize(bytes: number): Required<PdfCompressOptions> {
  return bytes > PDF_HEAVY_THRESHOLD ? HEAVY : STANDARD;
}

export async function compressPdfToImages(file: File, options: PdfCompressOptions = {}): Promise<File[]> {
  if (typeof document === 'undefined') return [];
  const { quality, maxWidthOrHeight } = { ...pdfOptionsForSize(file.size), ...options };

  const pdfjs = await import('pdfjs-dist');
  // Worker matched to the installed version (loaded lazily, only when a PDF is processed).
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const base = file.name.replace(/\.[^.]+$/, '') || 'document';
  const pages: File[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const base1 = page.getViewport({ scale: 1 });
    // Scale so the longest edge is ~maxWidthOrHeight (never upscale beyond ~2x for legibility).
    const scale = Math.min(2, maxWidthOrHeight / Math.max(base1.width, base1.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    // White background so transparent PDFs don't render black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    if (blob) {
      pages.push(
        new File([blob], `${base}-p${String(p).padStart(2, '0')}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })
      );
    }
    page.cleanup();
  }

  await loadingTask.destroy();
  return pages;
}
