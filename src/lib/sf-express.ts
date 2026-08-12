import crypto from 'crypto';
import {
  SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
  type SfExpressSettings,
} from '@/lib/integration-settings';

export const SF_SANDBOX_URL = 'https://sfapi-sbox.sf-express.com/std/service';
export const SF_PROD_URL = 'https://sfapi.sf-express.com/std/service';

export function sfExpressApiUrl(environment: 'sandbox' | 'production'): string {
  return environment === 'production' ? SF_PROD_URL : SF_SANDBOX_URL;
}

/**
 * SF 豐橋 msgDigest:
 * Base64(MD5(URLEncoder.encode(msgData + timestamp + checkword, "UTF-8")))
 * Hex escapes must be uppercase (Java URLEncoder style).
 */
export function sfUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
    .replace(/%20/g, '+');
}

/** Base64(MD5(URL-encoded msgData + timestamp + checkword)) per 豐橋 Open Platform. */
export function sfMsgDigest(msgData: string, timestamp: string, checkword: string): string {
  const toVerify = sfUrlEncode(msgData + timestamp + checkword);
  return crypto.createHash('md5').update(toVerify, 'utf8').digest('base64');
}

/** Map common SF simplified-Chinese API errors to Traditional Chinese for HK UI. */
export function toTraditionalSfMessage(message: string): string {
  const map: Record<string, string> = {
    数字签名无效: '數字簽名無效',
    系统异常: '系統異常',
    参数错误: '參數錯誤',
    必填参数为空: '必填參數為空',
    顾客编码不存在或错误: '顧客編碼不存在或錯誤',
    校验码错误: '校驗碼錯誤',
    重复下单: '重複下單',
    月结卡号不合法或不存在: '月結卡號不合法或不存在',
    寄件地址错误: '寄件地址錯誤',
    到件地址错误: '到件地址錯誤',
  };
  const trimmed = message.trim();
  if (map[trimmed]) return map[trimmed];
  let out = trimmed;
  for (const [simp, trad] of Object.entries(map)) {
    if (out.includes(simp)) out = out.split(simp).join(trad);
  }
  return out
    .replace(/顺丰/g, '順豐')
    .replace(/运单/g, '運單')
    .replace(/面单/g, '面單')
    .replace(/校验/g, '校驗')
    .replace(/顾客/g, '顧客')
    .replace(/编码/g, '編碼')
    .replace(/错误/g, '錯誤')
    .replace(/参数/g, '參數')
    .replace(/无效/g, '無效')
    .replace(/签名/g, '簽名')
    .replace(/系统/g, '系統')
    .replace(/异常/g, '異常')
    .replace(/重复/g, '重複')
    .replace(/月结/g, '月結')
    .replace(/卡号/g, '卡號');
}

export interface SfContactInfo {
  contactType: 1 | 2;
  company?: string;
  contact?: string;
  tel?: string;
  mobile?: string;
  country: string;
  address: string;
  province?: string;
  city?: string;
  county?: string;
}

export interface SfCargoDetail {
  name: string;
  count?: number;
  unit?: string;
  weight?: number;
  amount?: number;
}

export interface SfCreateOrderInput {
  orderId: string;
  language?: string;
  monthlyCard: string;
  payMethod: number;
  expressTypeId: number;
  parcelQty: number;
  totalWeight?: number;
  cargoDetails: SfCargoDetail[];
  contactInfoList: SfContactInfo[];
  remark?: string;
}

export interface SfCreateOrderResult {
  orderId: string;
  waybillNo: string;
  raw: unknown;
}

export interface SfCloudPrintResult {
  pdfUrl: string;
  raw: unknown;
}

type FetchLike = typeof fetch;

function parseApiResultData(body: Record<string, unknown>): Record<string, unknown> {
  const raw = body.apiResultData;
  if (raw == null) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export function extractWaybillNo(apiBody: Record<string, unknown>): string | null {
  const data = parseApiResultData(apiBody);
  const msgData = (data.msgData && typeof data.msgData === 'object'
    ? data.msgData
    : data) as Record<string, unknown>;

  const list = msgData.waybillNoInfoList;
  if (Array.isArray(list) && list.length > 0) {
    const first = list[0] as Record<string, unknown>;
    const no = first.waybillNo ?? first.waybill_no;
    if (typeof no === 'string' && no.trim()) return no.trim();
  }

  const direct = msgData.waybillNo ?? data.waybillNo;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return null;
}

export function extractCloudPrintPdfUrl(apiBody: Record<string, unknown>): string | null {
  const data = parseApiResultData(apiBody);
  const obj = (data.obj && typeof data.obj === 'object' ? data.obj : data) as Record<string, unknown>;
  const files = obj.files ?? data.files;
  if (Array.isArray(files) && files.length > 0) {
    const file = files[0] as Record<string, unknown>;
    const url = file.url ?? file.fileUrl ?? file.pdfUrl;
    if (typeof url === 'string' && url.trim()) return url.trim();
    const b64 = file.token ?? file.fileData ?? file.content ?? file.pdfBase64;
    if (typeof b64 === 'string' && b64.trim()) {
      const cleaned = b64.replace(/^data:application\/pdf;base64,/i, '').trim();
      return `data:application/pdf;base64,${cleaned}`;
    }
  }

  const topUrl = data.url ?? obj.url;
  if (typeof topUrl === 'string' && topUrl.trim()) return topUrl.trim();
  return null;
}

function sfErrorMessage(apiBody: Record<string, unknown>, fallback: string): string {
  const data = parseApiResultData(apiBody);
  const candidates = [
    apiBody.apiErrorMsg,
    data.errorMsg,
    data.errorMessage,
    data.msg,
    data.message,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return toTraditionalSfMessage(c.trim());
  }
  const code = apiBody.apiResultCode;
  if (typeof code === 'string' && code && code !== 'A1000') {
    return toTraditionalSfMessage(`${fallback} (${code})`);
  }
  return toTraditionalSfMessage(fallback);
}

export async function sfCallService(
  credentials: SfExpressSettings,
  serviceCode: string,
  msgDataObj: unknown,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const partnerID = credentials.partner_id.trim();
  const checkword = credentials.checkword.trim();
  if (!partnerID || !checkword) {
    throw new Error('SF Express is not configured (partner ID / checkword missing).');
  }

  const msgData = JSON.stringify(msgDataObj);
  const timestamp = String(Date.now());
  const requestID = crypto.randomUUID().replace(/-/g, '');
  const msgDigest = sfMsgDigest(msgData, timestamp, checkword);

  const body = new URLSearchParams({
    partnerID,
    requestID,
    serviceCode,
    timestamp,
    msgData,
    msgDigest,
  });

  const res = await fetchImpl(sfExpressApiUrl(credentials.environment), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString(),
  });

  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`SF Express returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(sfErrorMessage(parsed, `SF Express HTTP ${res.status}`));
  }

  const code = String(parsed.apiResultCode || '');
  if (code && code !== 'A1000') {
    throw new Error(sfErrorMessage(parsed, 'SF Express request failed'));
  }

  const data = parseApiResultData(parsed);
  if (data.success === false) {
    throw new Error(sfErrorMessage(parsed, 'SF Express request failed'));
  }

  return parsed;
}

export async function createSfOrder(
  credentials: SfExpressSettings,
  input: SfCreateOrderInput,
  fetchImpl: FetchLike = fetch
): Promise<SfCreateOrderResult> {
  const payload = {
    language: input.language || 'zh-HK',
    orderId: input.orderId,
    cargoDetails: input.cargoDetails,
    contactInfoList: input.contactInfoList,
    monthlyCard: input.monthlyCard,
    payMethod: input.payMethod,
    expressTypeId: input.expressTypeId,
    parcelQty: input.parcelQty,
    ...(input.totalWeight != null ? { totalWeight: input.totalWeight } : {}),
    ...(input.remark?.trim() ? { remark: input.remark.trim() } : {}),
  };

  const raw = await sfCallService(credentials, 'EXP_RECE_CREATE_ORDER', payload, fetchImpl);
  const waybillNo = extractWaybillNo(raw);
  if (!waybillNo) {
    throw new Error('SF Express create order succeeded but no waybill number was returned.');
  }

  const data = parseApiResultData(raw);
  const msgData = (data.msgData && typeof data.msgData === 'object'
    ? data.msgData
    : data) as Record<string, unknown>;
  const orderId =
    (typeof msgData.orderId === 'string' && msgData.orderId) || input.orderId;

  return { orderId, waybillNo, raw };
}

export async function cloudPrintWaybills(
  credentials: SfExpressSettings,
  waybillNo: string,
  fetchImpl: FetchLike = fetch
): Promise<SfCloudPrintResult> {
  const templateCode =
    credentials.print_template_code.trim() || SF_EXPRESS_DEFAULT_PRINT_TEMPLATE;
  const payload = {
    templateCode,
    version: '1.0',
    fileType: 'pdf',
    documents: [{ masterWaybillNo: waybillNo }],
  };

  const raw = await sfCallService(credentials, 'COM_RECE_CLOUD_PRINT_WAYBILLS', payload, fetchImpl);
  const pdfUrl = extractCloudPrintPdfUrl(raw);
  if (!pdfUrl) {
    throw new Error('SF Express cloud print succeeded but no PDF was returned.');
  }
  return { pdfUrl, raw };
}

export function buildSfCreateOrderPayload(args: {
  credentials: SfExpressSettings;
  form: {
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    country: string;
    cargoName: string;
    parcelQty: number;
    weightKg: number;
    payMethod: number;
    expressTypeId: number;
    remark: string;
  };
}): SfCreateOrderInput {
  const { credentials, form } = args;
  const phone = form.recipientPhone.trim();
  return {
    orderId: form.orderId.trim(),
    language: 'zh-HK',
    monthlyCard: credentials.monthly_card.trim(),
    payMethod: form.payMethod,
    expressTypeId: form.expressTypeId,
    parcelQty: Math.max(1, form.parcelQty || 1),
    totalWeight: form.weightKg > 0 ? form.weightKg : 1,
    cargoDetails: [
      {
        name: form.cargoName.trim() || 'Goods',
        count: Math.max(1, form.parcelQty || 1),
        unit: '件',
        weight: form.weightKg > 0 ? form.weightKg : 1,
      },
    ],
    contactInfoList: [
      {
        contactType: 1,
        company: credentials.sender_company.trim(),
        contact: credentials.sender_contact.trim(),
        tel: credentials.sender_tel.trim(),
        mobile: credentials.sender_tel.trim(),
        country: 'HK',
        address: credentials.sender_address.trim(),
      },
      {
        contactType: 2,
        contact: form.recipientName.trim(),
        tel: phone,
        mobile: phone,
        country: (form.country.trim() || 'HK').toUpperCase(),
        address: form.recipientAddress.trim(),
      },
    ],
    remark: form.remark,
  };
}
