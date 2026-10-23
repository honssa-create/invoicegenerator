import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  advancePrepOrderStatus,
  deletePrepOrder,
  getPrepOrder,
  loadPrepOrderDetail,
  resolveKitchenOwnerUserId,
  updatePrepOrder,
} from '@/lib/kitchen-prep-server';
import { isKitchenPrepStatusOnlyPatch, parsePrepStatusPatch } from '@/lib/kitchen-prep-patch';
import {
  PREP_ORDER_TYPES,
  PREP_STATUSES,
  computePrepCalculationForOrder,
  validatePrepFlavorQtys,
  type BirdNestType,
  type PrepCapacity,
  type PrepCapacityLineDraft,
  type PrepStatus,
} from '@/lib/kitchen-prep';
import { readKitchenPrepDetailContext } from '@/lib/kitchen-catalog-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const detail = await loadPrepOrderDetail(params.id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (isKitchenPrepStatusOnlyPatch(body)) {
      const nextStatus = parsePrepStatusPatch(body)!;
      const order = await advancePrepOrderStatus(params.id, nextStatus);
      if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ order });
    }

    const existing = await getPrepOrder(params.id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const kitchenOwnerId = await resolveKitchenOwnerUserId();
    const { capacities: capacityOptions, formulas } =
      await readKitchenPrepDetailContext(kitchenOwnerId);
    const allowedCaps = new Set(capacityOptions.map((c) => c.id));

    const parseBirdNestField = (v: unknown, fallback: BirdNestType): BirdNestType =>
      v === 'small' || v === 'large' ? v : fallback;

    if (Array.isArray(body.lines)) {
      const lines = (body.lines as PrepCapacityLineDraft[])
        .filter((line) => line && typeof line.capacity === 'string' && allowedCaps.has(line.capacity))
        .map((line) => ({
          capacity: line.capacity,
          qty_osmanthus: Number(line.qty_osmanthus) || 0,
          qty_red_date: Number(line.qty_red_date) || 0,
          qty_rock_sugar: Number(line.qty_rock_sugar) || 0,
          actual_qty_osmanthus:
            line.actual_qty_osmanthus == null ? null : Number(line.actual_qty_osmanthus) || 0,
          actual_qty_red_date:
            line.actual_qty_red_date == null ? null : Number(line.actual_qty_red_date) || 0,
          actual_qty_rock_sugar:
            line.actual_qty_rock_sugar == null ? null : Number(line.actual_qty_rock_sugar) || 0,
          bird_nest_osmanthus:
            line.bird_nest_osmanthus === 'small' || line.bird_nest_osmanthus === 'large'
              ? line.bird_nest_osmanthus
              : undefined,
          bird_nest_red_date:
            line.bird_nest_red_date === 'small' || line.bird_nest_red_date === 'large'
              ? line.bird_nest_red_date
              : undefined,
          bird_nest_rock_sugar:
            line.bird_nest_rock_sugar === 'small' || line.bird_nest_rock_sugar === 'large'
              ? line.bird_nest_rock_sugar
              : undefined,
        }));
      if (lines.length === 0) {
        return NextResponse.json({ error: 'At least one valid capacity line is required' }, { status: 400 });
      }
      const order = await updatePrepOrder(
        params.id,
        {
          stewing_date: body.stewing_date as string | undefined,
          order_type:
            typeof body.order_type === 'string' &&
            (PREP_ORDER_TYPES as readonly string[]).includes(body.order_type)
              ? (body.order_type as (typeof PREP_ORDER_TYPES)[number])
              : undefined,
          status: PREP_STATUSES.includes(body.status as PrepStatus)
            ? (body.status as PrepStatus)
            : undefined,
          notes: body.notes as string | null | undefined,
          lines,
        },
        { existing, stewFormulas: formulas.stewFormulas, skipRefetch: true },
      );
      const calculation = computePrepCalculationForOrder(order!, formulas.stewFormulas);
      return NextResponse.json({ order, calculation });
    }

    const capacityInput =
      typeof body.capacity === 'string' ? body.capacity : '';
    const capacity = (
      capacityInput && allowedCaps.has(capacityInput) ? capacityInput : existing.capacity
    ) as PrepCapacity;
    const qtys = {
      osmanthus: body.qty_osmanthus !== undefined ? Number(body.qty_osmanthus) : existing.qty_osmanthus,
      red_date: body.qty_red_date !== undefined ? Number(body.qty_red_date) : existing.qty_red_date,
      rock_sugar: body.qty_rock_sugar !== undefined ? Number(body.qty_rock_sugar) : existing.qty_rock_sugar,
    };
    const validationErr = validatePrepFlavorQtys(capacity, qtys, {
      formulas: formulas.stewFormulas,
    });
    if (validationErr) {
      return NextResponse.json({ error: validationErr }, { status: 400 });
    }

    const order = await updatePrepOrder(
      params.id,
      {
        stewing_date: body.stewing_date as string | undefined,
        order_type:
          typeof body.order_type === 'string' &&
          (PREP_ORDER_TYPES as readonly string[]).includes(body.order_type)
            ? (body.order_type as (typeof PREP_ORDER_TYPES)[number])
            : undefined,
        capacity,
        status: PREP_STATUSES.includes(body.status as PrepStatus)
          ? (body.status as PrepStatus)
          : undefined,
        qty_osmanthus: qtys.osmanthus,
        qty_red_date: qtys.red_date,
        qty_rock_sugar: qtys.rock_sugar,
        actual_qty_osmanthus:
          body.actual_qty_osmanthus !== undefined ? Number(body.actual_qty_osmanthus) : undefined,
        actual_qty_red_date:
          body.actual_qty_red_date !== undefined ? Number(body.actual_qty_red_date) : undefined,
        actual_qty_rock_sugar:
          body.actual_qty_rock_sugar !== undefined ? Number(body.actual_qty_rock_sugar) : undefined,
        bird_nest_osmanthus:
          body.bird_nest_osmanthus !== undefined
            ? parseBirdNestField(body.bird_nest_osmanthus, existing.bird_nest_osmanthus)
            : undefined,
        bird_nest_red_date:
          body.bird_nest_red_date !== undefined
            ? parseBirdNestField(body.bird_nest_red_date, existing.bird_nest_red_date)
            : undefined,
        bird_nest_rock_sugar:
          body.bird_nest_rock_sugar !== undefined
            ? parseBirdNestField(body.bird_nest_rock_sugar, existing.bird_nest_rock_sugar)
            : undefined,
        notes: body.notes as string | null | undefined,
      },
      {
        existing,
        stewFormulas: formulas.stewFormulas,
        skipRefetch: true,
      },
    );

    const calculation = computePrepCalculationForOrder(order!, formulas.stewFormulas);

    return NextResponse.json({ order, calculation });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await deletePrepOrder(params.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
