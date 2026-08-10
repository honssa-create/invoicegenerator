import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getOrder, logActivity } from '@/lib/order-server';
import { getDataOwnerId } from '@/lib/org-server';
import {
  getSfExpressCredentials,
  sfExpressConfigured,
} from '@/lib/integration-settings-server';
import {
  buildSfCreateOrderPayload,
  cloudPrintWaybills,
  createSfOrder,
} from '@/lib/sf-express';
import {
  buildSfExpressFormDefaults,
  validateSfExpressForm,
  type SfExpressFormState,
} from '@/lib/sf-express-form';
import { bi } from '@/lib/ui-labels';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session.userId);
  const order = await getOrder(params.id, ownerId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const credentials = await getSfExpressCredentials(ownerId);
  const form = buildSfExpressFormDefaults(order, {
    payMethod: credentials.pay_method,
    expressTypeId: credentials.express_type_id,
  });

  return NextResponse.json({
    configured: sfExpressConfigured(credentials),
    sender: {
      company: credentials.sender_company,
      contact: credentials.sender_contact,
      tel: credentials.sender_tel,
      address: credentials.sender_address,
    },
    defaults: {
      payMethod: credentials.pay_method || '1',
      expressTypeId: credentials.express_type_id || '1',
      environment: credentials.environment,
      printTemplateCode: credentials.print_template_code,
    },
    form,
    existingTrackingNo:
      typeof order.fields.tracking_no === 'string' ? order.fields.tracking_no.trim() : '',
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);
  const order = await getOrder(params.id, ownerId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const credentials = await getSfExpressCredentials(ownerId);
  if (!sfExpressConfigured(credentials)) {
    return NextResponse.json(
      {
        error: bi(
          'SF Express is not configured. Ask an admin to fill Settings → API Integrations → SF Express.',
          '尚未設定順豐。請管理員於 設定 → API 整合 → 順豐 填寫資料。'
        ),
      },
      { status: 400 }
    );
  }

  let body: Partial<SfExpressFormState>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const form: SfExpressFormState = {
    ...buildSfExpressFormDefaults(order, {
      payMethod: credentials.pay_method,
      expressTypeId: credentials.express_type_id,
    }),
    ...body,
  };

  const validationError = validateSfExpressForm(form);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const payMethod = Number.parseInt(form.payMethod, 10) || 1;
  const expressTypeId = Number.parseInt(form.expressTypeId, 10) || 1;
  const parcelQty = Number.parseInt(form.parcelQty, 10) || 1;
  const weightKg = Number.parseFloat(form.weightKg) || 1;

  let waybillNo = '';
  let sfOrderId = form.orderId.trim();
  let pdfUrl: string | null = null;
  let printError: string | null = null;

  try {
    const created = await createSfOrder(
      credentials,
      buildSfCreateOrderPayload({
        credentials,
        form: {
          orderId: form.orderId.trim(),
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          recipientAddress: form.recipientAddress,
          country: form.country,
          cargoName: form.cargoName,
          parcelQty,
          weightKg,
          payMethod,
          expressTypeId,
          remark: form.remark,
        },
      })
    );
    waybillNo = created.waybillNo;
    sfOrderId = created.orderId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SF Express create order failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Persist tracking even if cloud print fails.
  const existing = await db
    .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId) as { fields_json: string | null } | undefined;

  let current: Record<string, unknown> = {};
  try {
    current = existing?.fields_json ? JSON.parse(existing.fields_json) : {};
  } catch {
    current = {};
  }

  const shippingMethod =
    typeof current.shipping_method === 'string' && current.shipping_method.trim()
      ? current.shipping_method
      : 'SF 順豐';

  const merged = {
    ...current,
    tracking_no: waybillNo,
    sf_order_id: sfOrderId,
    shipping_method: shippingMethod,
  };

  await db
    .prepare(
      `UPDATE orders SET fields_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    )
    .run(JSON.stringify(merged), params.id, ownerId);

  try {
    const printed = await cloudPrintWaybills(credentials, waybillNo);
    pdfUrl = printed.pdfUrl;
  } catch (err) {
    printError = err instanceof Error ? err.message : 'Cloud print failed';
  }

  const activityBody = printError
    ? `SF Express waybill created: ${waybillNo} (print failed: ${printError})`
    : `SF Express waybill created: ${waybillNo}`;

  await logActivity(params.id, session.userId, 'activity', 'System', activityBody);

  const updated = await getOrder(params.id, ownerId);
  return NextResponse.json({
    order: updated,
    waybill: waybillNo,
    sfOrderId,
    pdfUrl,
    printError,
  });
}
