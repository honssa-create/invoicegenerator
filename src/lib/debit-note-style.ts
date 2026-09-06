/** Client-safe debit note visual style template (maps to CSS custom properties). */
export interface DebitNoteStyleTemplate {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  colorText: string;
  colorMuted: string;
  colorBorder: string;
  colorBorderStrong: string;
  colorTotal: string;
  colorTotalBg: string;
  headerTitleSize: string;
  headerTitleSpacing: string;
  headerSubtitleSpacing: string;
  pagePadding: string;
  sectionGap: string;
}

export const DEFAULT_DEBIT_NOTE_STYLE: DebitNoteStyleTemplate = {
  fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontSize: '0.875rem',
  lineHeight: '1.625',
  colorText: '#111827',
  colorMuted: '#6b7280',
  colorBorder: '#9ca3af',
  colorBorderStrong: '#1f2937',
  colorTotal: '#991b1b',
  colorTotalBg: 'rgb(255 251 235 / 0.6)',
  headerTitleSize: '1.5rem',
  headerTitleSpacing: '0.35em',
  headerSubtitleSpacing: '0.25em',
  pagePadding: '2.5rem',
  sectionGap: '2rem',
};

export type DebitNoteStyleField = keyof DebitNoteStyleTemplate;

export const DEBIT_NOTE_STYLE_FIELDS: {
  key: DebitNoteStyleField;
  label: string;
  labelZh: string;
  type: 'text' | 'color' | 'size';
  placeholder?: string;
}[] = [
  { key: 'fontFamily', label: 'Font family', labelZh: '字體', type: 'text', placeholder: 'Arial, sans-serif' },
  { key: 'fontSize', label: 'Body font size', labelZh: '內文字號', type: 'size', placeholder: '0.875rem' },
  { key: 'lineHeight', label: 'Line height', labelZh: '行距', type: 'text', placeholder: '1.625' },
  { key: 'colorText', label: 'Text colour', labelZh: '文字顏色', type: 'color' },
  { key: 'colorMuted', label: 'Muted text', labelZh: '次要文字', type: 'color' },
  { key: 'colorBorder', label: 'Border colour', labelZh: '邊框顏色', type: 'color' },
  { key: 'colorBorderStrong', label: 'Header border', labelZh: '標題底線', type: 'color' },
  { key: 'colorTotal', label: 'Total amount colour', labelZh: '總額顏色', type: 'color' },
  { key: 'colorTotalBg', label: 'Total box background', labelZh: '總額框底色', type: 'text', placeholder: '#fff9e6 or rgb(...)' },
  { key: 'headerTitleSize', label: 'Title size', labelZh: '標題字號', type: 'size', placeholder: '1.5rem' },
  { key: 'headerTitleSpacing', label: 'Title letter spacing', labelZh: '標題字距', type: 'text', placeholder: '0.35em' },
  { key: 'headerSubtitleSpacing', label: 'Subtitle spacing', labelZh: '副標字距', type: 'text', placeholder: '0.25em' },
  { key: 'pagePadding', label: 'Page padding', labelZh: '頁面內距', type: 'size', placeholder: '2.5rem' },
  { key: 'sectionGap', label: 'Section gap', labelZh: '區塊間距', type: 'size', placeholder: '2rem' },
];

export function normalizeDebitNoteStyle(input: Partial<DebitNoteStyleTemplate> | null | undefined): DebitNoteStyleTemplate {
  return { ...DEFAULT_DEBIT_NOTE_STYLE, ...(input || {}) };
}

/** Apply template as inline CSS custom properties on the document root element. */
export function debitNoteStyleToCssVars(style: DebitNoteStyleTemplate): Record<string, string> {
  return {
    '--dn-font-family': style.fontFamily,
    '--dn-font-size': style.fontSize,
    '--dn-line-height': style.lineHeight,
    '--dn-color-text': style.colorText,
    '--dn-color-muted': style.colorMuted,
    '--dn-color-border': style.colorBorder,
    '--dn-color-border-strong': style.colorBorderStrong,
    '--dn-color-total': style.colorTotal,
    '--dn-color-total-bg': style.colorTotalBg,
    '--dn-header-title-size': style.headerTitleSize,
    '--dn-header-title-spacing': style.headerTitleSpacing,
    '--dn-header-subtitle-spacing': style.headerSubtitleSpacing,
    '--dn-page-padding': style.pagePadding,
    '--dn-section-gap': style.sectionGap,
    '--dn-meta-border': '1px solid #d1d5db',
    '--dn-header-border': `2px solid ${style.colorBorderStrong}`,
    '--dn-table-border': `1px solid ${style.colorBorder}`,
    '--dn-total-border': `2px solid ${style.colorBorder}`,
  };
}
