/** Client-safe quotation visual style (maps to CSS custom properties on the preview). */

export interface QuotationStyleTemplate {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  colorText: string;
  colorMuted: string;
  colorLabel: string;
  colorAccent: string;
  colorAccentText: string;
  colorRule: string;
  fieldBackground: string;
  titleSize: string;
  pagePadding: string;
  pageNumberSize: string;
  pageNumberColor: string;
  tableHeaderFontSize: string;
  logoMaxHeight: string;
  logoMaxWidth: string;
}

export const DEFAULT_QUOTATION_STYLE: QuotationStyleTemplate = {
  fontFamily: "Arial, 'Helvetica Neue', Helvetica, 'Microsoft JhengHei', 'PingFang TC', sans-serif",
  fontSize: '13px',
  lineHeight: '1.45',
  colorText: '#222222',
  colorMuted: '#9a9a9a',
  colorLabel: '#b0b0b0',
  colorAccent: '#e8a070',
  colorAccentText: '#ffffff',
  colorRule: '#e8a070',
  fieldBackground: '#fafafa',
  titleSize: '36px',
  pagePadding: '48px 52px 56px',
  pageNumberSize: '11px',
  pageNumberColor: '#666666',
  tableHeaderFontSize: '11px',
  logoMaxHeight: '88px',
  logoMaxWidth: '160px',
};

export type QuotationStyleField = keyof QuotationStyleTemplate;

export const QUOTATION_STYLE_FIELDS: {
  key: QuotationStyleField;
  label: string;
  labelZh: string;
  type: 'text' | 'color' | 'size';
  placeholder?: string;
}[] = [
  { key: 'fontFamily', label: 'Font family', labelZh: '字體', type: 'text', placeholder: 'Arial, sans-serif' },
  { key: 'fontSize', label: 'Body font size', labelZh: '內文字號', type: 'size', placeholder: '13px' },
  { key: 'lineHeight', label: 'Line height', labelZh: '行距', type: 'text', placeholder: '1.45' },
  { key: 'colorText', label: 'Text colour', labelZh: '文字顏色', type: 'color' },
  { key: 'colorMuted', label: 'Muted text', labelZh: '次要文字', type: 'color' },
  { key: 'colorLabel', label: 'Label colour', labelZh: '標籤顏色', type: 'color' },
  { key: 'colorAccent', label: 'Accent colour', labelZh: '主題色', type: 'color' },
  { key: 'colorAccentText', label: 'Accent text', labelZh: '主題文字色', type: 'color' },
  { key: 'colorRule', label: 'Rule / divider', labelZh: '分隔線顏色', type: 'color' },
  {
    key: 'fieldBackground',
    label: 'Field background',
    labelZh: '欄位底色',
    type: 'color',
  },
  { key: 'titleSize', label: 'Title size', labelZh: '標題字號', type: 'size', placeholder: '36px' },
  { key: 'tableHeaderFontSize', label: 'Table header size', labelZh: '表頭字號', type: 'size', placeholder: '11px' },
  { key: 'pagePadding', label: 'Page padding', labelZh: '頁面內距', type: 'size', placeholder: '48px 52px 56px' },
  { key: 'pageNumberSize', label: 'Page number size', labelZh: '頁碼字號', type: 'size', placeholder: '11px' },
  { key: 'pageNumberColor', label: 'Page number colour', labelZh: '頁碼顏色', type: 'color' },
  { key: 'logoMaxHeight', label: 'Logo max height', labelZh: '標誌高度', type: 'size', placeholder: '88px' },
  { key: 'logoMaxWidth', label: 'Logo max width', labelZh: '標誌寬度', type: 'size', placeholder: '160px' },
];

export function normalizeQuotationStyle(
  input: Partial<QuotationStyleTemplate> | null | undefined,
): QuotationStyleTemplate {
  return { ...DEFAULT_QUOTATION_STYLE, ...(input || {}) };
}

/** Apply template as inline CSS custom properties on the preview root. */
export function quotationStyleToCssVars(style: QuotationStyleTemplate): Record<string, string> {
  return {
    '--quo-font-family': style.fontFamily,
    '--quo-font-size': style.fontSize,
    '--quo-line-height': style.lineHeight,
    '--quo-color-text': style.colorText,
    '--quo-color-muted': style.colorMuted,
    '--quo-color-label': style.colorLabel,
    '--quo-color-accent': style.colorAccent,
    '--quo-color-accent-text': style.colorAccentText,
    '--quo-color-rule': style.colorRule,
    '--quo-field-bg': style.fieldBackground,
    '--quo-title-size': style.titleSize,
    '--quo-page-padding': style.pagePadding,
    '--quo-page-number-size': style.pageNumberSize,
    '--quo-page-number-color': style.pageNumberColor,
    '--quo-table-header-size': style.tableHeaderFontSize,
    '--quo-logo-max-height': style.logoMaxHeight,
    '--quo-logo-max-width': style.logoMaxWidth,
  };
}

const STORAGE_PREFIX = 'quotation-template-sum-sign:';
const LEGACY_STORAGE_PREFIX = 'quotation-style-template:';

export function loadQuotationStyleFromStorage(variant: string): QuotationStyleTemplate | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      localStorage.getItem(`${STORAGE_PREFIX}${variant}`) ||
      localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${variant}`);
    if (!raw) return null;
    return normalizeQuotationStyle(JSON.parse(raw) as Partial<QuotationStyleTemplate>);
  } catch {
    return null;
  }
}

export function saveQuotationStyleToStorage(variant: string, style: QuotationStyleTemplate): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_PREFIX}${variant}`, JSON.stringify(style));
}

export function formatQuotationMoney(amount: number, currency = 'HKD'): string {
  const code = (currency || 'HKD').trim().toUpperCase() || 'HKD';
  try {
    return new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatQuotationDate(dateStr: string | null | undefined): string {
  if (!dateStr?.trim()) return '';
  const raw = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}/${m}/${y}`;
  }
  return raw;
}

