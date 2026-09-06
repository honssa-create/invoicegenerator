/** Safe download filename without extension. */
export function sanitizePdfBasename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  return cleaned || 'document';
}

function sliceCanvas(source: HTMLCanvasElement, y: number, height: number): HTMLCanvasElement {
  const slice = document.createElement('canvas');
  slice.width = source.width;
  slice.height = Math.max(1, Math.min(height, source.height - y));
  const ctx = slice.getContext('2d');
  if (!ctx) throw new Error('Could not create PDF canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, slice.width, slice.height);
  ctx.drawImage(source, 0, y, source.width, slice.height, 0, 0, source.width, slice.height);
  return slice;
}

/** Rasterize an on-screen A4 print preview into a multi-page PDF download. */
export async function downloadElementAsA4Pdf(el: HTMLElement, basename: string): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const pageHeightPx = Math.max(1, Math.round((pageH / pageW) * canvas.width));

  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const slice = sliceCanvas(canvas, y, pageHeightPx);
    const data = slice.toDataURL('image/jpeg', 0.92);
    const sliceH = (slice.height / canvas.width) * pageW;
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(data, 'JPEG', 0, 0, pageW, sliceH);
    y += pageHeightPx;
  }

  pdf.save(`${sanitizePdfBasename(basename)}.pdf`);
}
