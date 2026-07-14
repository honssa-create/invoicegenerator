import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { entityBelongsToUser, getActivities, logActivity, type EntityType } from '@/lib/activity';

const TYPES: EntityType[] = ['order', 'invoice', 'quotation'];

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as EntityType | null;
  const id = searchParams.get('id');
  if (!type || !TYPES.includes(type) || !id) {
    return NextResponse.json({ error: 'type and id are required' }, { status: 400 });
  }
  if (!entityBelongsToUser(type, id, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ activities: getActivities(type, id) });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { type, id, body } = await request.json();
    if (!TYPES.includes(type) || !id) {
      return NextResponse.json({ error: 'type and id are required' }, { status: 400 });
    }
    if (!entityBelongsToUser(type, id, session.userId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    logActivity(type, id, session.userId, 'comment', session.name, text);
    return NextResponse.json({ activities: getActivities(type, id) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
