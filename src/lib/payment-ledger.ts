/**
 * Pure extractors for the payment ledger (入帳紀錄).
 * ClickUp Nestiee 婚宴回禮 comments and payment custom fields → ledger rows.
 * No database access — safe to unit test and to import from server code.
 */
import type { ClickUpComment, ClickUpCustomField, ClickUpTask } from './clickup';

export const DEFAULT_CLICKUP_PAYMENT_LIST_ID = '901812202272';

/** Optional override. The Nestiee 婚宴回禮 list is the default. */
export function clickUpPaymentListId(): string {
  return (process.env.CLICKUP_PAYMENT_LIST_ID || DEFAULT_CLICKUP_PAYMENT_LIST_ID).trim();
}

/** Custom fields the ledger reads. Webhook `taskUpdated` events for other fields are ignored. */
export const PAYMENT_LEDGER_CLICKUP_FIELDS = [
  '第一次Payment日期',
  '第一次Payment ($)',
  '第二次Payment日期',
  '第2次Payment($)',
  'Payment',
  'Order #',
] as const;

const [FIELD_DATE_1, FIELD_AMOUNT_1, FIELD_DATE_2, FIELD_AMOUNT_2, FIELD_PAYMENT, FIELD_ORDER_NO] =
  PAYMENT_LEDGER_CLICKUP_FIELDS;

export function isPaymentLedgerClickUpField(name: string | null | undefined): boolean {
  const want = (name || '').replace(/\s+/g, '');
  if (!want) return false;
  return PAYMENT_LEDGER_CLICKUP_FIELDS.some((field) => field.replace(/\s+/g, '') === want);
}

export const CLICKUP_PAYMENT_WEBHOOK_PATH = '/api/webhooks/clickup';

/** Events to subscribe when creating the list webhook. `taskUpdated` also carries payment custom-field edits. */
export const CLICKUP_PAYMENT_WEBHOOK_EVENTS = ['taskCommentPosted', 'taskCommentUpdated', 'taskUpdated'] as const;

export function clickUpPaymentWebhookUrl(origin: string): string {
  const base = (origin || '').trim().replace(/\/$/, '');
  if (!base) return CLICKUP_PAYMENT_WEBHOOK_PATH;
  return `${base}${CLICKUP_PAYMENT_WEBHOOK_PATH}`;
}

export type PaymentLedgerAttachment = {
  name: string;
  url: string;
  /** Smaller ClickUp rendition for the table. Lightbox uses `url`. */
  thumbnail_url?: string;
  id?: string;
};

const IMAGE_EXT = /\.(?:png|jpe?g|webp|gif|bmp|heic|heif|avif)(?:$|[?#])/i;
const CLICKUP_FILE_HOST = /(^|\.)clickup\.com$|(^|\.)clickup-attachments\.com$/i;

/** Previewable picture: image extension on the name or URL, or a data:image URL. */
export function isImageAttachment(item: { name?: string; url?: string }): boolean {
  const url = (item.url || '').trim();
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const path = url.split('?')[0];
  return IMAGE_EXT.test(item.name || '') || IMAGE_EXT.test(path);
}

/** ClickUp-hosted files are loaded through our API so the token stays on the server. */
export function isClickUpAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && CLICKUP_FILE_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

/** Table / lightbox src. ClickUp hosts go through the authenticated file route. */
export function ledgerAttachmentSrc(
  entryId: number,
  index: number,
  item: PaymentLedgerAttachment,
  variant: 'thumb' | 'full',
): string {
  const raw = (variant === 'thumb' ? item.thumbnail_url || item.url : item.url || '').trim();
  if (!raw) return '';
  if (isClickUpAttachmentUrl(raw)) {
    return `/api/payment-ledger/files?id=${entryId}&index=${index}&variant=${variant}`;
  }
  return raw;
}

/** Ledger 類別. Nestiee 婚宴回禮 sync uses 回禮; the others are for later sources. */
export const PAYMENT_LEDGER_CATEGORIES = ['回禮', '襟章', '燕窩', '其他'] as const;
export type PaymentLedgerCategory = (typeof PAYMENT_LEDGER_CATEGORIES)[number];
export const DEFAULT_PAYMENT_LEDGER_CATEGORY: PaymentLedgerCategory = '回禮';

export function isPaymentLedgerCategory(value: unknown): value is PaymentLedgerCategory {
  return typeof value === 'string' && (PAYMENT_LEDGER_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 付款方式. ClickUp's Payment label and comment text map onto this list.
 * Blank means the source did not name a method.
 */
export const PAYMENT_LEDGER_METHODS = [
  'FPS',
  '轉帳',
  'PayMe',
  '支票',
  '現金',
  '信用卡',
  '八達通',
  '支付寶',
  '微信支付',
  '其他',
] as const;
export type PaymentLedgerMethod = (typeof PAYMENT_LEDGER_METHODS)[number];

export function isPaymentLedgerMethod(value: unknown): value is PaymentLedgerMethod {
  return typeof value === 'string' && (PAYMENT_LEDGER_METHODS as readonly string[]).includes(value);
}

/** Manual edit. Empty string clears the cell; anything else must be a known method. */
export function parsePaymentLedgerMethodInput(value: unknown): PaymentLedgerMethod | '' | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return '';
  return isPaymentLedgerMethod(text) ? text : null;
}

const LABEL_TO_PAYMENT_METHOD: Record<string, PaymentLedgerMethod> = {
  fps: 'FPS',
  轉數快: 'FPS',
  銀行轉賬: '轉帳',
  銀行轉帳: '轉帳',
  銀行轉账: '轉帳',
  轉帳: '轉帳',
  轉賬: '轉帳',
  轉账: '轉帳',
  payme: 'PayMe',
  支票: '支票',
  現金: '現金',
  信用卡: '信用卡',
  八達通: '八達通',
  支付寶: '支付寶',
  支付宝: '支付寶',
  微信支付: '微信支付',
  其他: '其他',
};

/** ClickUp Payment labels that name a method. Status labels (Full Paid, 50% payment) are ignored. */
export function paymentMethodFromLabels(labels: string[]): PaymentLedgerMethod | null {
  const found: PaymentLedgerMethod[] = [];
  for (const label of labels) {
    const text = label.trim();
    const method = LABEL_TO_PAYMENT_METHOD[text.toLowerCase()] || LABEL_TO_PAYMENT_METHOD[text];
    if (method && !found.includes(method)) found.push(method);
  }
  if (found.length !== 1) return null;
  return found[0];
}

const PAYMENT_METHOD_PATTERNS: Array<{ method: PaymentLedgerMethod; pattern: RegExp }> = [
  { method: 'PayMe', pattern: /pay\s*me\b/i },
  { method: '八達通', pattern: /八達通|\boctopus\b/i },
  { method: '支付寶', pattern: /支付寶|支付宝|\balipay\b/i },
  { method: '微信支付', pattern: /微信支付|微信付款|wechat\s*pay/i },
  { method: '支票', pattern: /支票|\bcheque\b/i },
  { method: '現金', pattern: /現金|\bcash\b/i },
  { method: '信用卡', pattern: /信用卡|信用咭|credit\s*card|\bvisa\b|\bmastercard\b/i },
  { method: '轉帳', pattern: /銀行轉[帳賬账]|轉[帳賬账]|\bbank\s*transfer\b|過數/i },
  { method: 'FPS', pattern: /轉數快|\bfps\b|faster\s*payment/i },
  { method: '其他', pattern: /付款方式\s*[:：]\s*其他|其他付款方式/ },
];

/**
 * Honour's own receiving account, copied into almost every confirmation.
 * "轉數快 FPS ID：110700226" is payee instructions, not proof this payment used FPS.
 */
function withoutPayeeAccount(text: string): string {
  return text.replace(
    /(?:轉數快\s*)?FPS\s*(?:識別碼|ID)\s*[:：]?\s*\d+|轉數快\s*(?:識別碼|ID)\s*[:：]?\s*\d+/gi,
    ' ',
  );
}

/**
 * One clear method from comment / notes / filename text.
 * Two different methods, or only a payee FPS ID, stay blank.
 */
export function paymentMethodFromText(text: string | null | undefined): PaymentLedgerMethod | null {
  const cleaned = withoutPayeeAccount(String(text || ''));
  const found: PaymentLedgerMethod[] = [];
  for (const rule of PAYMENT_METHOD_PATTERNS) {
    if (rule.pattern.test(cleaned) && !found.includes(rule.method)) found.push(rule.method);
  }
  if (found.length !== 1) return null;
  return found[0];
}

export type PaymentLedgerDraft = {
  dedupe_key: string;
  paid_date: string | null;
  amount: number | null;
  order_no: string;
  notes: string;
  link: string;
  attachments: PaymentLedgerAttachment[];
  clickup_task_id: string;
  source: 'comment' | 'installment';
  category: PaymentLedgerCategory;
  payment_method: PaymentLedgerMethod | null;
};

const PAYMENT_SIGNAL =
  /(?:\bpayment\b|full\s*paid|full\s*payment|\bfps\b|銀行轉[帳账]|已付|尾[數数]|加單金額|加单金额|(?<!\d)50\s*%)/i;
const EXTRA_CHARGE = /加.{0,16}金額|加單金額|加单金额/;
const FILE_LINE = /\.(?:png|jpe?g|webp|gif|pdf|heic)$/i;

/** ClickUp unix-ms → `YYYY-MM-DD` in Asia/Hong_Kong. */
export function clickUpMsToHkDate(ms: string | number | null | undefined): string | null {
  const n = typeof ms === 'number' ? ms : Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(n));
}

/** Order number is the first 4–5 digit run in the task title (12104, 10949, 散水 - 11931). */
export function orderNoFromTaskTitle(title: string, orderField?: string | null): string {
  const raw = (title || '').replace(/^\uFEFF/, '').trim();
  const match = raw.match(/(\d{4,5})(?!\d)/);
  if (match) return match[1];
  return (orderField || '').trim();
}

function compactName(name: string): string {
  return name.replace(/\s+/g, '');
}

function findField(task: ClickUpTask, name: string): ClickUpCustomField | undefined {
  const want = compactName(name);
  return (task.custom_fields || []).find((field) => compactName(field.name || '') === want);
}

function fieldLabels(field: ClickUpCustomField | undefined): string[] {
  if (!field || field.value == null || field.value === '') return [];
  const options = field.type_config?.options || [];
  const raw = Array.isArray(field.value) ? field.value : [field.value];
  const names: string[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const labeled = item as { label?: string; name?: string };
      const label = (labeled.label || labeled.name || '').trim();
      if (label) names.push(label);
      continue;
    }
    const id = String(item);
    const option = options.find((opt) => opt.id === id) as { label?: string; name?: string } | undefined;
    const label = (option?.label || option?.name || '').trim();
    if (label) names.push(label);
  }
  return names;
}

function fieldAmount(field: ClickUpCustomField | undefined): number | null {
  if (!field || field.value == null || field.value === '') return null;
  const n = Number(String(field.value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function fieldDate(field: ClickUpCustomField | undefined): string | null {
  if (!field || field.value == null || field.value === '') return null;
  const value = field.value;
  if (typeof value === 'object' && value && 'date' in value) {
    return clickUpMsToHkDate((value as { date?: string | number }).date);
  }
  if (typeof value === 'string' || typeof value === 'number') return clickUpMsToHkDate(value);
  return null;
}

function taskLink(task: ClickUpTask): string {
  const url = (task.url || '').trim();
  if (url) return url;
  return `https://app.clickup.com/t/${task.id}`;
}

function commentLink(task: ClickUpTask, commentId: string): string {
  const base = taskLink(task);
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}comment=${encodeURIComponent(commentId)}`;
}

function isFilenameLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && trimmed.length < 180 && FILE_LINE.test(trimmed);
}

function attachmentFromSource(src: Record<string, unknown>, fallbackName: string): PaymentLedgerAttachment | null {
  const name = String(src.name || src.title || fallbackName || 'attachment').trim() || 'attachment';
  const url = String(src.url || src.thumbnail_large || src.url_w_query || '').trim();
  const thumbnail = String(src.thumbnail_small || src.thumbnail_medium || src.thumbnail_large || '').trim();
  const id = src.id != null ? String(src.id) : undefined;
  if (!name && !url) return null;
  return {
    name,
    url,
    ...(thumbnail && thumbnail !== url ? { thumbnail_url: thumbnail } : {}),
    ...(id ? { id } : {}),
  };
}

/** Keep every distinct file URL. A filename-only copy is dropped when the same name already has a URL. */
export function dedupeAttachments(list: PaymentLedgerAttachment[]): PaymentLedgerAttachment[] {
  const withUrl: PaymentLedgerAttachment[] = [];
  const seenUrl = new Set<string>();
  const namesWithUrl = new Set<string>();
  for (const item of list) {
    const url = (item.url || '').trim();
    if (!url) continue;
    const key = url.toLowerCase();
    if (seenUrl.has(key)) continue;
    seenUrl.add(key);
    const name = (item.name || '').trim() || 'attachment';
    namesWithUrl.add(name.toLowerCase());
    withUrl.push({
      name,
      url,
      ...(item.thumbnail_url ? { thumbnail_url: item.thumbnail_url } : {}),
      ...(item.id ? { id: item.id } : {}),
    });
  }
  const nameOnly: PaymentLedgerAttachment[] = [];
  const seenName = new Set<string>();
  for (const item of list) {
    if ((item.url || '').trim()) continue;
    const name = (item.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (namesWithUrl.has(key) || seenName.has(key)) continue;
    seenName.add(key);
    nameOnly.push({ name, url: '', ...(item.id ? { id: item.id } : {}) });
  }
  return [...withUrl, ...nameOnly];
}

export function attachmentsFromClickUpComment(comment: ClickUpComment): PaymentLedgerAttachment[] {
  const found: PaymentLedgerAttachment[] = [];
  const blocks = Array.isArray(comment.comment) ? comment.comment : [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const record = block as Record<string, unknown>;
    const sources = [record.image, record.attachment, record.file].filter(
      (value) => value && typeof value === 'object',
    ) as Record<string, unknown>[];
    if (!sources.length && record.type === 'image' && typeof record.text === 'string') {
      const name = record.text.trim();
      if (name) found.push({ name, url: '' });
      continue;
    }
    for (const src of sources) {
      const item = attachmentFromSource(src, typeof record.text === 'string' ? record.text : '');
      if (item) found.push(item);
    }
  }
  for (const line of (comment.comment_text || '').split('\n')) {
    const trimmed = line.trim();
    if (isFilenameLine(trimmed)) found.push({ name: trimmed, url: '' });
  }
  return dedupeAttachments(found);
}

function joinNotes(...parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    for (const segment of (part || '').split(' · ')) {
      const text = segment.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  }
  return out.join(' · ').slice(0, 500);
}

function notesFromComment(text: string, attachmentNames: string[]): string {
  const names = new Set(attachmentNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !names.has(line.toLowerCase()) && !isFilenameLine(line));
  const interesting = lines.filter((line) => PAYMENT_SIGNAL.test(line) || EXTRA_CHARGE.test(line) || /[$＄]/.test(line));
  const chosen = interesting.length ? interesting : lines;
  return chosen.join(' · ').slice(0, 500);
}

function isQuotationDump(text: string): boolean {
  return text.length > 180 && /即食燕窩回禮|𝑪𝒐𝒏𝒇𝒊𝒓𝒎𝒂𝒕𝒊𝒐𝒏|confirmation/i.test(text);
}

/** Payment comments: keywords, receipt screenshots with payment text, or a Payment filename. */
export function commentLooksLikePayment(text: string, attachmentNames: string[]): boolean {
  if (attachmentNames.some((name) => /payment/i.test(name))) return true;
  if (isQuotationDump(text) && !/已付|尾[數数]|加.{0,16}金額/.test(text)) return false;
  if (PAYMENT_SIGNAL.test(text) || EXTRA_CHARGE.test(text)) return true;
  const hasScreenshot =
    attachmentNames.some((name) => /^image\.png$/i.test(name)) || /(^|\n)\s*image\.png\s*($|\n)/i.test(text);
  if (hasScreenshot && /(?:\$|＄|已付|金額|\bpayment\b|\bfps\b|轉[帳账])/i.test(text)) return true;
  const notes = notesFromComment(text, attachmentNames);
  if (notes.length > 0 && notes.length <= 80 && /(?:HK\$|HKD|＄|\$)\s*\d/.test(notes) && !/[/／]\s*樽/.test(notes)) {
    return true;
  }
  return false;
}

const MONEY_AMOUNT = /(?:HK\$|HKD|＄|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/;
/**
 * Amount written after a payment label when the comment left off HK$ / $.
 * `1st payment 7866`, `payment 7,866`. The number has to stay on the same line.
 */
const LABELED_BARE_AMOUNT =
  /(?:\b(?:1st|2nd|3rd|first|second|third)\s+payment\b|\bpayment\b|已付|付款)[ \t]*[:：]?[ \t]*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/i;
/** 加單 comment marker. Broader than this, `EXTRA_CHARGE` also matches notes like 加20樽金額. */
const ADDON_CHARGE_LABEL = /加單金額|加单金额/;

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** Currency figure written immediately after a 加單金額 label, not a later 總額. */
const ADDON_MONEY_AFTER_LABEL =
  /^[\s:：,，.。、\]】)）]{0,8}(?:HK\$|HKD|＄|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/;

function skipBareAmountTail(after: string): boolean {
  if (/^[ \t]*[/／]\s*(?:樽|瓶|pcs|pc|ml)/i.test(after)) return true;
  // 樽/瓶 are not ASCII word characters, so a trailing \b would miss them at end of text.
  if (/^[ \t]*(?:樽|瓶)/.test(after)) return true;
  if (/^[ \t]*(?:pcs|pc|ml)\b/i.test(after)) return true;
  if (/^[ \t]*(?:%|％)/.test(after)) return true;
  if (/^[-/.]\d/.test(after)) return true;
  return false;
}

/** Same-line payment labels with no currency symbol. Skips a figure already captured as HK$ / $. */
function appendLabeledBareAmounts(text: string, amounts: number[]) {
  const re = new RegExp(LABELED_BARE_AMOUNT.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 8);
    if (skipBareAmountTail(after)) continue;
    const n = Number(`${match[1].replace(/,/g, '')}${match[2] || ''}`);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (amounts.some((kept) => amountsClose(kept, n))) continue;
    amounts.push(n);
  }
}

/**
 * Dollar amounts that are not per-bottle unit prices (`$45/樽`).
 * Every HK$/HKD/$/＄ figure is returned, including 總額.
 * A payment label with no currency symbol is included too (`1st payment 7866`,
 * `payment 7866`). Dates, percentages (`100%`), and per-bottle quantities are not.
 * 加單 comments do not use this list directly — see `selectCommentPaymentAmounts`.
 *
 * RULE (enforced by `selectCommentPaymentAmounts`, not by this scanner)：加單 comment（有「加單金額」）只入帳加單金額一筆；唔好入總額；同一 comment 重複加單金額只計一次。
 */
export function parsePaymentAmounts(text: string): number[] {
  const amounts: number[] = [];
  const re = new RegExp(MONEY_AMOUNT.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 8);
    if (/^\s*[/／]\s*(?:樽|瓶|pcs|pc|ml)/i.test(after)) continue;
    const n = Number(`${match[1].replace(/,/g, '')}${match[2] || ''}`);
    if (Number.isFinite(n) && n > 0) amounts.push(n);
  }
  appendLabeledBareAmounts(text, amounts);
  return amounts;
}

/**
 * Amounts from one payment comment.
 *
 * RULE：加單 comment（有「加單金額」）只入帳加單金額一筆；唔好入總額；同一 comment 重複加單金額只計一次。
 * The dollar figure has to sit next to 加單金額 / 加单金额 (e.g. `加單金額：$1,835`).
 * 總額 and any other labeled total in that comment are ignored. The same 加單金額
 * repeated in the comment is kept once, so the ledger row is `comment:{taskId}:{commentId}`
 * with no `:index`. Two different 加單金額 figures stay as separate amounts so a real
 * second add-on is not dropped or added into 總額. Comments without 加單金額 still
 * return every payment amount, and `commentDrafts` emits `:index` when there are several.
 */
export function selectCommentPaymentAmounts(text: string): number[] {
  if (!ADDON_CHARGE_LABEL.test(text)) return parsePaymentAmounts(text);
  const found: number[] = [];
  const re = new RegExp(ADDON_CHARGE_LABEL.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const afterLabel = text.slice(match.index + match[0].length, match.index + match[0].length + 32);
    const money = ADDON_MONEY_AFTER_LABEL.exec(afterLabel);
    if (!money) continue;
    const after = afterLabel.slice(money[0].length, money[0].length + 8);
    if (/^\s*[/／]\s*(?:樽|瓶|pcs|pc|ml)/i.test(after)) continue;
    const amount = Number(`${money[1].replace(/,/g, '')}${money[2] || ''}`);
    if (!Number.isFinite(amount) || amount <= 0 || found.some((kept) => amountsClose(kept, amount))) continue;
    found.push(amount);
  }
  return found;
}

function paidStatusLabels(labels: string[]): string[] {
  return labels.map((label) => label.trim()).filter((label) => label && label !== '未付款');
}

function installmentDraft(
  task: ClickUpTask,
  slot: 1 | 2,
  paidDate: string | null,
  amount: number | null,
  labels: string[],
  orderNo: string,
): PaymentLedgerDraft | null {
  if (!paidDate && amount == null) return null;
  const paid = paidStatusLabels(labels);
  const slotNote = slot === 1 ? '第一次付款' : '第二次付款';
  return {
    dedupe_key: `installment:${task.id}:${slot}`,
    paid_date: paidDate,
    amount,
    order_no: orderNo,
    notes: joinNotes(paid.join(' · '), slotNote),
    link: taskLink(task),
    attachments: [],
    clickup_task_id: task.id,
    source: 'installment',
    category: DEFAULT_PAYMENT_LEDGER_CATEGORY,
    payment_method: paymentMethodFromLabels(labels),
  };
}

function mergeIntoInstallment(target: PaymentLedgerDraft, extra: PaymentLedgerDraft) {
  target.notes = joinNotes(target.notes, extra.notes);
  target.attachments = dedupeAttachments([...target.attachments, ...extra.attachments]);
  if (!target.paid_date && extra.paid_date) target.paid_date = extra.paid_date;
  if (target.amount == null && extra.amount != null) target.amount = extra.amount;
  if (!target.payment_method && extra.payment_method) target.payment_method = extra.payment_method;
}

/** Written on both rows when a same-day comment cannot be tied to one installment. */
export const SAME_DAY_UNCERTAIN_NOTE = '同日有付款留言／收據，未能確定係同一筆定另一筆';

const SAME_DAY_AMOUNT_WINDOW = 1;
const FULL_OR_HALF_RECEIPT = /full\s*paid|full\s*payment|(?<!\d)50\s*%|(?<!\d)100\s*%/i;
const SLOT_ONE = /第一次|(?<![A-Za-z0-9])(?:1st|first)(?![A-Za-z0-9])/i;
const SLOT_TWO = /第二次|第2次|(?<![A-Za-z0-9])(?:2nd|second)(?![A-Za-z0-9])/i;
const BALANCE_PAYMENT = /尾[數数]/;

export type SameDayPaymentReview =
  | { decision: 'one'; dedupe_key: string }
  | { decision: 'two' }
  | { decision: 'uncertain' }
  | { decision: 'not-same-day' };

function commentBlob(comment: Pick<PaymentLedgerDraft, 'notes' | 'attachments'>): string {
  return `${comment.notes} ${comment.attachments.map((item) => item.name).join(' ')}`;
}

function hasReceiptFile(comment: Pick<PaymentLedgerDraft, 'attachments'>): boolean {
  return comment.attachments.some((item) => (item.url || '').trim() || (item.name || '').trim());
}

function amountsWithinDollar(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_DAY_AMOUNT_WINDOW;
}

function installmentSlot(row: PaymentLedgerDraft): 1 | 2 | null {
  if (row.dedupe_key.endsWith(':1')) return 1;
  if (row.dedupe_key.endsWith(':2')) return 2;
  return null;
}

function namedInstallmentSlot(blob: string): 1 | 2 | 'both' | null {
  const first = SLOT_ONE.test(blob);
  const second = SLOT_TWO.test(blob);
  if (first && second) return 'both';
  if (first) return 1;
  if (second) return 2;
  return null;
}

function uniqueAmounts(amounts: number[]): number[] {
  const out: number[] = [];
  for (const amount of amounts) {
    if (!out.some((kept) => amountsClose(kept, amount))) out.push(amount);
  }
  return out;
}

/** Bare numbers that can be checked against an installment. Dates, percents, and per-bottle prices are left out. */
function standalonePaymentNumbers(text: string): number[] {
  const re = /(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![\d,])/g;
  const out: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 10);
    const before = text.slice(Math.max(0, match.index - 8), match.index);
    if (skipBareAmountTail(after)) continue;
    if (/\d[-/.]$/.test(before)) continue;
    const n = Number(`${match[1].replace(/,/g, '')}${match[2] || ''}`);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/** When the comment never wrote a currency symbol, use a bare number that hits exactly one same-day installment. */
function echoedInstallmentAmount(blob: string, sameDay: PaymentLedgerDraft[]): number | null {
  const numbers = standalonePaymentNumbers(blob);
  const hits = sameDay.filter(
    (row) => row.amount != null && numbers.some((n) => amountsWithinDollar(n, row.amount as number)),
  );
  if (hits.length !== 1 || hits[0].amount == null) return null;
  return hits[0].amount;
}

/**
 * Amount used for the same-day compare.
 * Stored comment rows can have a null amount while the notes still say `1st payment 7866`.
 * Several different labeled amounts are a conflict, not a guess.
 */
function sameDayAmount(comment: PaymentLedgerDraft, sameDay: PaymentLedgerDraft[]): number | 'conflict' | null {
  if (comment.amount != null) return comment.amount;
  const labeled = uniqueAmounts(selectCommentPaymentAmounts(comment.notes));
  if (labeled.length > 1) return 'conflict';
  if (labeled.length === 1) return labeled[0];
  return echoedInstallmentAmount(commentBlob(comment), sameDay);
}

/**
 * Same Hong Kong calendar day does not by itself mean one payment.
 * `paid_date` values are already `YYYY-MM-DD` in Asia/Hong_Kong.
 *
 * RULE：同日唔代表一定係同一筆。要分清係兩筆付款定一筆（例如留言只係第一次／第二次嗰筆嘅收據）。
 * 確定係同一筆先將收據併入該期入帳列；確定係另一筆就分開兩行。
 * 未能確定就唔好當係同一筆，備註要寫：同日有付款留言／收據，未能確定係同一筆定另一筆。
 *
 * One payment: amount within $1 of exactly one installment (including a bare
 * `1st payment 7866` with no HK$), or a Full/50%/100% receipt with no conflicting
 * separate amount, or the comment names 第一次/1st/first or 第二次/2nd/second and has a receipt file.
 * Two payments: a different amount, 加單, or 尾數. The receipt stays on the comment.
 */
export function reviewSameDayPayments(
  comment: PaymentLedgerDraft,
  installments: PaymentLedgerDraft[],
): SameDayPaymentReview {
  const day = comment.paid_date;
  if (!day) return { decision: 'not-same-day' };
  const sameDay = installments.filter((row) => row.paid_date === day);
  if (!sameDay.length) return { decision: 'not-same-day' };

  const blob = commentBlob(comment);
  if (EXTRA_CHARGE.test(comment.notes) || BALANCE_PAYMENT.test(blob)) return { decision: 'two' };

  const amount = sameDayAmount(comment, sameDay);
  if (amount === 'conflict') return { decision: 'uncertain' };
  if (amount != null) {
    const close = sameDay.filter((row) => row.amount != null && amountsWithinDollar(row.amount, amount));
    if (close.length === 1) return { decision: 'one', dedupe_key: close[0].dedupe_key };
    if (close.length > 1) return { decision: 'uncertain' };
    if (sameDay.some((row) => row.amount != null)) return { decision: 'two' };
    return { decision: 'uncertain' };
  }

  const slot = namedInstallmentSlot(blob);
  const slotRow =
    slot === 1 || slot === 2 ? sameDay.find((row) => installmentSlot(row) === slot) : undefined;
  const fullOrHalf = FULL_OR_HALF_RECEIPT.test(blob);
  const namedReceipt = (slot === 1 || slot === 2) && hasReceiptFile(comment);

  if (fullOrHalf || namedReceipt) {
    if (slotRow) return { decision: 'one', dedupe_key: slotRow.dedupe_key };
    if (slot === 'both' || (slot && !slotRow)) return { decision: 'uncertain' };
    if (sameDay.length === 1) return { decision: 'one', dedupe_key: sameDay[0].dedupe_key };
    return { decision: 'uncertain' };
  }

  return { decision: 'uncertain' };
}

/**
 * A comment that only restates an installment (same amount, or a Full Paid / 50% / 100% receipt
 * with no separate amount) is folded into that installment so the ledger keeps one row.
 * Used when the comment is not on the installment's Hong Kong calendar day.
 * Same-day comments go through `reviewSameDayPayments` first.
 * 加單 / 尾數 comments stay as their own rows.
 */
function matchingInstallment(comment: PaymentLedgerDraft, installments: PaymentLedgerDraft[]): PaymentLedgerDraft | null {
  if (EXTRA_CHARGE.test(comment.notes)) return null;
  if (comment.amount != null) {
    return installments.find((row) => row.amount != null && amountsClose(row.amount, comment.amount as number)) || null;
  }
  const blob = commentBlob(comment);
  const receipt = FULL_OR_HALF_RECEIPT.test(blob) || /\bpayment\b/i.test(blob);
  if (!receipt) return null;
  if (SLOT_TWO.test(blob) || BALANCE_PAYMENT.test(blob)) {
    return installments.find((row) => row.dedupe_key.endsWith(':2')) || installments[0] || null;
  }
  return installments.find((row) => row.dedupe_key.endsWith(':1')) || installments[0] || null;
}

/**
 * One payment comment → ledger drafts.
 * RULE：加單 comment（有「加單金額」）只入帳加單金額一筆；唔好入總額；同一 comment 重複加單金額只計一次。
 * A single kept amount uses `comment:{taskId}:{commentId}` (no `:index`).
 */
function commentDrafts(task: ClickUpTask, comments: ClickUpComment[], orderNo: string): PaymentLedgerDraft[] {
  const rows: PaymentLedgerDraft[] = [];
  for (const comment of comments) {
    const id = String(comment.id || '').trim();
    if (!id) continue;
    const text = comment.comment_text || '';
    const attachments = attachmentsFromClickUpComment(comment);
    const names = attachments.map((item) => item.name);
    if (!commentLooksLikePayment(text, names)) continue;
    const notes = notesFromComment(text, names);
    const amounts = selectCommentPaymentAmounts(notes || text);
    const paidDate = clickUpMsToHkDate(comment.date);
    const payment_method = paymentMethodFromText(`${notes}\n${names.join('\n')}`);
    const base = {
      paid_date: paidDate,
      order_no: orderNo,
      notes,
      link: commentLink(task, id),
      attachments,
      clickup_task_id: task.id,
      source: 'comment' as const,
      category: DEFAULT_PAYMENT_LEDGER_CATEGORY,
      payment_method,
    };
    if (amounts.length <= 1) {
      rows.push({
        ...base,
        dedupe_key: `comment:${task.id}:${id}`,
        amount: amounts[0] ?? null,
      });
      continue;
    }
    amounts.forEach((amount, index) => {
      rows.push({
        ...base,
        dedupe_key: `comment:${task.id}:${id}:${index}`,
        amount,
      });
    });
  }
  return rows;
}

/** One task's payment fields + comments → deduped ledger rows. */
export function extractPaymentLedgerRows(task: ClickUpTask, comments: ClickUpComment[] = []): PaymentLedgerDraft[] {
  const orderNo = orderNoFromTaskTitle(task.name, fieldText(findField(task, FIELD_ORDER_NO)));
  const labels = fieldLabels(findField(task, FIELD_PAYMENT));
  const installments: PaymentLedgerDraft[] = [];
  const first = installmentDraft(
    task,
    1,
    fieldDate(findField(task, FIELD_DATE_1)),
    fieldAmount(findField(task, FIELD_AMOUNT_1)),
    labels,
    orderNo,
  );
  const second = installmentDraft(
    task,
    2,
    fieldDate(findField(task, FIELD_DATE_2)),
    fieldAmount(findField(task, FIELD_AMOUNT_2)),
    labels,
    orderNo,
  );
  if (first) installments.push(first);
  if (second) installments.push(second);
  if (!installments.length && paidStatusLabels(labels).length) {
    installments.push({
      dedupe_key: `installment:${task.id}:1`,
      paid_date: null,
      amount: null,
      order_no: orderNo,
      notes: joinNotes(paidStatusLabels(labels).join(' · '), '第一次付款'),
      link: taskLink(task),
      attachments: [],
      clickup_task_id: task.id,
      source: 'installment',
      category: DEFAULT_PAYMENT_LEDGER_CATEGORY,
      payment_method: paymentMethodFromLabels(labels),
    });
  }

  const kept: PaymentLedgerDraft[] = [];
  for (const comment of commentDrafts(task, comments, orderNo)) {
    const review = reviewSameDayPayments(comment, installments);
    if (review.decision === 'one') {
      const target = installments.find((row) => row.dedupe_key === review.dedupe_key);
      if (target) {
        mergeIntoInstallment(target, comment);
        continue;
      }
    }
    if (review.decision === 'uncertain') {
      const day = comment.paid_date;
      comment.notes = joinNotes(comment.notes, SAME_DAY_UNCERTAIN_NOTE);
      for (const row of installments) {
        if (row.paid_date === day) row.notes = joinNotes(row.notes, SAME_DAY_UNCERTAIN_NOTE);
      }
      kept.push(comment);
      continue;
    }
    if (review.decision === 'two') {
      kept.push(comment);
      continue;
    }
    const target = matchingInstallment(comment, installments);
    if (target) mergeIntoInstallment(target, comment);
    else kept.push(comment);
  }
  return [...installments, ...kept];
}

/** Live order Vanessa confirmed is one payment. The one-shot repair does not touch other orders. */
export const ORDER_12212_SAME_DAY_REPAIR = '12212';

export type SameDayRepairPlan = {
  updates: PaymentLedgerDraft[];
  delete_keys: string[];
};

function withoutUncertainNote(notes: string): string {
  const parts = (notes || '')
    .split(SAME_DAY_UNCERTAIN_NOTE)
    .join(' ')
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && part !== '·');
  return joinNotes(...parts);
}

function cloneDraft(row: PaymentLedgerDraft): PaymentLedgerDraft {
  return {
    ...row,
    notes: row.notes || '',
    order_no: (row.order_no || '').trim(),
    link: row.link || '',
    attachments: [...(row.attachments || [])],
    clickup_task_id: row.clickup_task_id || '',
    category: row.category || DEFAULT_PAYMENT_LEDGER_CATEGORY,
    payment_method: row.payment_method || null,
  };
}

function draftSnapshot(row: PaymentLedgerDraft): string {
  return JSON.stringify({
    amount: row.amount,
    notes: row.notes,
    attachments: row.attachments,
    payment_method: row.payment_method || null,
  });
}

function planOneTaskSameDayRepair(rows: PaymentLedgerDraft[]): SameDayRepairPlan {
  const installments = rows.filter((row) => row.source === 'installment').map(cloneDraft);
  const comments = rows.filter((row) => row.source === 'comment').map(cloneDraft);
  const before = new Map(installments.map((row) => [row.dedupe_key, draftSnapshot(row)]));
  const delete_keys: string[] = [];
  for (const comment of comments) {
    if (!(comment.notes || '').includes(SAME_DAY_UNCERTAIN_NOTE)) continue;
    const review = reviewSameDayPayments(comment, installments);
    if (review.decision !== 'one') continue;
    const target = installments.find((row) => row.dedupe_key === review.dedupe_key);
    if (!target) continue;
    const extra = { ...comment, notes: withoutUncertainNote(comment.notes) };
    if (extra.amount == null) {
      const labeled = uniqueAmounts(selectCommentPaymentAmounts(extra.notes));
      if (labeled.length === 1) extra.amount = labeled[0];
    }
    mergeIntoInstallment(target, extra);
    delete_keys.push(comment.dedupe_key);
  }
  const removed = new Set(delete_keys);
  const foldedDays = new Set(comments.filter((row) => removed.has(row.dedupe_key)).map((row) => row.paid_date));
  for (const inst of installments) {
    if (!foldedDays.has(inst.paid_date)) continue;
    const pending = comments.some(
      (row) =>
        !removed.has(row.dedupe_key) &&
        row.paid_date === inst.paid_date &&
        (row.notes || '').includes(SAME_DAY_UNCERTAIN_NOTE),
    );
    if (!pending) inst.notes = withoutUncertainNote(inst.notes);
  }
  return {
    updates: installments.filter((row) => before.get(row.dedupe_key) !== draftSnapshot(row)),
    delete_keys,
  };
}

/**
 * Fold stored order 12212 rows that the corrected same-day rule now calls one payment.
 * Only a comment that already carries the uncertain note is eligible, and only when
 * `reviewSameDayPayments` returns `one`. Other orders are ignored.
 */
export function planOrder12212SameDayRepair(rows: PaymentLedgerDraft[]): SameDayRepairPlan {
  const groups = new Map<string, PaymentLedgerDraft[]>();
  for (const row of rows) {
    if ((row.order_no || '').trim() !== ORDER_12212_SAME_DAY_REPAIR) continue;
    const key = row.clickup_task_id || '';
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const updates: PaymentLedgerDraft[] = [];
  const delete_keys: string[] = [];
  for (const group of Array.from(groups.values())) {
    const plan = planOneTaskSameDayRepair(group);
    updates.push(...plan.updates);
    delete_keys.push(...plan.delete_keys);
  }
  return { updates, delete_keys };
}

function fieldText(field: ClickUpCustomField | undefined): string {
  if (!field || field.value == null) return '';
  return String(field.value).trim();
}
