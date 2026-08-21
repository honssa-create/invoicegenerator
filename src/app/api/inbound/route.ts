import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const shipments = await db
    .prepare('SELECT * FROM inbound_shipments WHERE user_id = ? ORDER BY COALESCE(arrival_date, created_at) DESC, id DESC')
    .all(ownerId);
  return NextResponse.json({ shipments });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    if (!body.waybill_number?.trim() && !body.photo_path?.trim()) {
      return NextResponse.json({ error: 'Enter a waybill number or attach a photo' }, { status: 400 });
    }
    const ownerId = await getDataOwnerId(session);
    const result = await db
      .prepare(
        `INSERT INTO inbound_shipments (user_id, waybill_number, sender, sender_address, receiver_address, arrival_date, photo_path, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ownerId,
        body.waybill_number?.trim() || null,
        body.sender?.trim() || null,
        body.sender_address?.trim() || null,
        body.receiver_address?.trim() || null,
        body.arrival_date?.trim() || null,
        body.photo_path?.trim() || null,
        body.notes?.trim() || null
      );
    const shipment = await db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ shipment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to save shipment' }, { status: 500 });
  }
}
