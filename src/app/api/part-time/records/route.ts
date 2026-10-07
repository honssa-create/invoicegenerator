import { NextResponse } from 'next/server';
import { parseRecordQuery } from '@/lib/part-time';
import { requirePartTime } from '@/lib/part-time-guard';
import { listRecords } from '@/lib/part-time-server';

export async function GET(request: Request) {
  const access = await requirePartTime(request);
  if (access instanceof NextResponse) return access;
  const url = new URL(request.url);
  const parsed = parseRecordQuery(url.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const forCsv = url.searchParams.get('format') === 'csv';
  const result = await listRecords(access.ownerId, parsed, { forCsv });
  if (forCsv) {
    return new NextResponse(result.csv || '', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="part-time-attendance.csv"',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return NextResponse.json({
    records: result.records,
    summary: result.summary,
    truncated: result.truncated,
  });
}
