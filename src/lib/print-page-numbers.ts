/** A4 portrait height used by quotation / invoice / receipt print templates. */
export const PRINT_PAGE_HEIGHT_MM = 297;

/** Footer label shown on each printed sheet. */
export function formatPrintPageLabel(page: number, total: number): string {
  return `Page ${page} of ${total}`;
}

/** How many A4 sheets a measured document occupies. */
export function countPrintPages(heightPx: number, pageHeightPx: number): number {
  if (!(pageHeightPx > 0) || !(heightPx > 0)) return 1;
  return Math.max(1, Math.ceil(heightPx / pageHeightPx - 1e-9));
}
