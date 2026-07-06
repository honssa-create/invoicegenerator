import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { trashCustomer } from '@/lib/trash';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);

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

  const existing = db
    .prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);

  if (!existing) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  try {
    const { name, email, phone, address, city, state, zip } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    db.prepare(
      `UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, zip = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      address?.trim() || null,
      city?.trim() || null,
      state?.trim() || null,
      zip?.trim() || null,
      params.id,
      session.userId
    );

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(params.id);
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

  const invoiceCount = (
    db
      .prepare('SELECT COUNT(*) as count FROM invoices WHERE customer_id = ? AND user_id = ?')
      .get(params.id, session.userId) as { count: number }
  ).count;

  if (invoiceCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete customer with existing invoices' },
      { status: 400 }
    );
  }

  if (!trashCustomer(session.userId, Number(params.id))) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
