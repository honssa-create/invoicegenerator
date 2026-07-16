import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { extractReceiptUrls } from './expense-import-receipts';

const DISPIMG_ID_RE = /DISPIMG\s*\(\s*["'](ID_[0-9A-F]{32})["']/i;

export interface XlsxEmbeddedImage {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

export interface XlsxReceiptAssets {
  urlsByDataRow: Map<number, string[]>;
  imagesByDataRow: Map<number, XlsxEmbeddedImage[]>;
}

function pushMapSet<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(value);
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('formula' in value && typeof value.formula === 'string') return value.formula;
    if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink;
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((p) => p.text || '').join('');
    }
    if ('result' in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
  }
  return '';
}

function mimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return map[ext.toLowerCase()] || 'image/jpeg';
}

/** Map WPS/Excel DISPIMG ids (ID_xxx) to image buffers from xl/cellimages.xml. */
async function dispimgIdToBuffer(buffer: Buffer): Promise<Map<string, Buffer>> {
  const map = new Map<string, Buffer>();
  const zip = await JSZip.loadAsync(buffer);
  const cellimagesXml = await zip.file('xl/cellimages.xml')?.async('string');
  const relsXml = await zip.file('xl/_rels/cellimages.xml.rels')?.async('string');
  if (!cellimagesXml || !relsXml) return map;

  const relTarget = new Map<string, string>();
  for (const m of relsXml.match(/Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g) || []) {
    const parts = /Id="([^"]+)"[^>]*Target="([^"]+)"/.exec(m);
    if (parts) relTarget.set(parts[1], parts[2].replace(/^\//, ''));
  }

  const blocks = cellimagesXml.match(/<etc:cellImage[\s\S]*?<\/etc:cellImage>/g) || [];
  for (const block of blocks) {
    const idMatch = block.match(/name="(ID_[0-9A-F]{32})"/i);
    const embedMatch = block.match(/r:embed="([^"]+)"/i);
    if (!idMatch || !embedMatch) continue;
    const target = relTarget.get(embedMatch[1]);
    if (!target) continue;
    const mediaPath = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\.\//, '')}`;
    const file = zip.file(mediaPath);
    if (!file) continue;
    const imgBuf = Buffer.from(await file.async('arraybuffer'));
    if (imgBuf.length) map.set(idMatch[1], imgBuf);
  }

  return map;
}

/** Scan an .xlsx for hyperlinks, DISPIMG embedded images, and row-anchored pictures. */
export async function scanXlsxReceiptAssets(buffer: Buffer): Promise<XlsxReceiptAssets> {
  const urlsByDataRow = new Map<number, string[]>();
  const imagesByDataRow = new Map<number, XlsxEmbeddedImage[]>();

  const dispimgMap = await dispimgIdToBuffer(buffer);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { urlsByDataRow, imagesByDataRow };

  const headerRows = 1;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRows) return;
    const dataRowIndex = rowNumber - headerRows - 1;
    const urls = new Set<string>();

    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell.value);
      for (const u of extractReceiptUrls(text)) urls.add(u);
      if (typeof cell.value === 'object' && cell.value && 'hyperlink' in cell.value) {
        const link = (cell.value as { hyperlink?: string }).hyperlink;
        if (link) for (const u of extractReceiptUrls(link)) urls.add(u);
      }

      const dispimg = text.match(DISPIMG_ID_RE);
      if (dispimg?.[1]) {
        const imgBuf = dispimgMap.get(dispimg[1]);
        if (imgBuf) {
          pushMapSet(imagesByDataRow, dataRowIndex, {
            buffer: imgBuf,
            mimeType: mimeFromExtension('jpeg'),
            name: `${dispimg[1]}.jpg`,
          });
        }
      }
    });

    if (urls.size) urlsByDataRow.set(dataRowIndex, Array.from(urls));
  });

  const media = wb.model.media || [];
  for (const img of ws.getImages()) {
    const medium = media[Number(img.imageId)];
    const mediumBuf = medium?.buffer ? Buffer.from(medium.buffer as ArrayBuffer) : null;
    if (!mediumBuf?.length) continue;
    const rowNumber = img.range.tl.nativeRow ?? img.range.tl.row;
    if (rowNumber <= headerRows) continue;
    const dataRowIndex = rowNumber - headerRows - 1;
    const ext = medium.extension || 'jpeg';
    pushMapSet(imagesByDataRow, dataRowIndex, {
      buffer: mediumBuf,
      mimeType: mimeFromExtension(ext),
      name: `${medium.name || 'embedded'}.${ext}`,
    });
  }

  return { urlsByDataRow, imagesByDataRow };
}
