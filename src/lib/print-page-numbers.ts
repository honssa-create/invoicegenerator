/** A4 portrait height used by quotation / invoice / receipt print templates. */
export const PRINT_PAGE_HEIGHT_MM = 297;

/** Bottom margin reserved on each printed sheet for the page-number footer. */
export const PRINT_PAGE_FOOTER_RESERVE_MM = 14;

/** Footer label shown on each printed sheet. */
export function formatPrintPageLabel(page: number, total: number): string {
  return `Page ${page} of ${total}`;
}

/** How many A4 sheets a measured document occupies. */
export function countPrintPages(heightPx: number, pageHeightPx: number): number {
  if (!(pageHeightPx > 0) || !(heightPx > 0)) return 1;
  return Math.max(1, Math.ceil(heightPx / pageHeightPx - 1e-9));
}

/** Content height per sheet after reserving space for the page-number footer. */
export function usablePrintPageHeightPx(fullPageHeightPx: number, footerReserveMm = PRINT_PAGE_FOOTER_RESERVE_MM): number {
  if (!(fullPageHeightPx > 0)) return 1;
  if (!(footerReserveMm > 0)) return fullPageHeightPx;
  const footerPx = Math.round(fullPageHeightPx * (footerReserveMm / PRINT_PAGE_HEIGHT_MM));
  return Math.max(1, fullPageHeightPx - footerPx);
}
