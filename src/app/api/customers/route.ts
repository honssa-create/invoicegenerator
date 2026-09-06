import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { upsertCustomer } from '@/lib/customer-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const ordered = new URL(request.url).searchParams.get('ordered')?.trim() ?? null;

  const customers = ordered
    ? await db
        .prepare(
          `SELECT * FROM customers
           WHERE user_id = ? AND COALESCE(trim(ordered), '') = ?
           ORDER BY name`
        )
        .all(ownerId, ordered)
    : await db.prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY name').all(ownerId);

  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, company_name, email, phone, address, ordered } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const ownerId = await getDataOwnerId(session);
    const { id, created } = await upsertCustomer(ownerId, {
      name: name.trim(),
      companyName: company_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      orderType: ordered?.trim() || null,
    });

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return NextResponse.json({ customer, created }, { status: created ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
