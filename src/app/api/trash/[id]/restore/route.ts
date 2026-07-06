import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { restoreFromTrash, TRASH_ENTITY_LABELS, type TrashEntityType } from '@/lib/trash';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = restoreFromTrash(Number(params.id), session.userId);
    return NextResponse.json({
      success: true,
      entity_type: result.entity_type,
      entity_id: result.entity_id,
      entity_label: TRASH_ENTITY_LABELS[result.entity_type as TrashEntityType],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to restore';
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
