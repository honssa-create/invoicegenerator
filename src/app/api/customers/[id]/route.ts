import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { normalizeCustomerName } from '@/lib/customer-name';
import { trashCustomer } from '@/lib/trash';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const customer = await db
    .prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId);

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json({ customer });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const existing = await db
    .prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId);

  if (!existing) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  try {
    const { name, company_name, email, phone, address, ordered } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    await db.prepare(
      `UPDATE customers SET name = ?, company_name = ?, email = ?, phone = ?, address = ?, ordered = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      normalizeCustomerName(name.trim()) || name.trim(),
      company_name?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      address?.trim() || null,
      ordered?.trim() || null,
      params.id,
      ownerId
    );

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(params.id);
    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const invoiceCount = (
    await db
      .prepare('SELECT COUNT(*) as count FROM invoices WHERE customer_id = ? AND user_id = ?')
      .get(params.id, ownerId) as { count: number }
  ).count;

  if (invoiceCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete customer with existing invoices' },
      { status: 400 }
    );
  }

  if (!await trashCustomer(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
