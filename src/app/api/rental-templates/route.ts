import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { listRentalTemplates } from '@/lib/rental-template-server';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = await rentalOwnerId(session);
  return NextResponse.json({ templates: await listRentalTemplates(ownerId) });
}
