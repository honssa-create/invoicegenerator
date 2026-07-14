import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const shipments = db
    .prepare('SELECT * FROM inbound_shipments WHERE user_id = ? ORDER BY COALESCE(arrival_date, created_at) DESC, id DESC')
    .all(session.userId);
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
    const result = db
      .prepare(
        `INSERT INTO inbound_shipments (user_id, waybill_number, sender, arrival_date, photo_path, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.userId,
        body.waybill_number?.trim() || null,
        body.sender?.trim() || null,
        body.arrival_date?.trim() || null,
        body.photo_path?.trim() || null,
        body.notes?.trim() || null
      );
    const shipment = db.prepare('SELECT * FROM inbound_shipments WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json({ shipment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to save shipment' }, { status: 500 });
  }
}
