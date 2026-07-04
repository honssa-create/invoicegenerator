import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { parseBankStatementFile } from '@/lib/bank-statement';
import { reconcileBankStatement } from '@/lib/reconciliation';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(session.userId) as {
    role: string;
  };

  if (user?.role !== 'accountant') {
    return NextResponse.json(
      { error: 'Only accountants can import bank statements' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const filename = file.name;
    const lower = filename.toLowerCase();
    if (
      !lower.endsWith('.csv') &&
      !lower.endsWith('.xlsx') &&
      !lower.endsWith('.xls') &&
      !lower.endsWith('.txt')
    ) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload CSV or Excel (.xlsx, .xls).' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseBankStatementFile(buffer, filename);

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'No deposit rows found in the file. Check column headers and deposit amounts.' },
        { status: 400 }
      );
    }

    const result = reconcileBankStatement(
      parsed.rows,
      session.userId,
      session.userId,
      parsed.bankName
    );

    return NextResponse.json({
      summary: {
        totalRows: parsed.rows.length,
        exactMatches: result.exactMatches.length,
        suggestedMatches: result.suggestedMatches.length,
        unclaimedCreated: result.unclaimedCreated.length,
        skipped: result.skipped,
      },
      exactMatches: result.exactMatches.map((m) => ({
        rowIndex: m.row.rowIndex,
        date: m.row.transactionDate,
        amount: m.row.depositAmount,
        description: m.row.description,
        paymentId: m.paymentId,
        invoiceNumber: m.invoiceNumber,
        customerName: m.customerName,
        matchType: m.matchType,
      })),
      suggestedMatches: result.suggestedMatches.map((m) => ({
        rowIndex: m.row.rowIndex,
        date: m.row.transactionDate,
        amount: m.row.depositAmount,
        description: m.row.description,
        paymentId: m.paymentId,
        invoiceNumber: m.invoiceNumber,
        customerName: m.customerName,
        paymentDate: m.paymentDate,
        daysDiff: m.daysDiff,
        matchType: m.matchType,
      })),
      unclaimedCreated: result.unclaimedCreated.map((u) => ({
        rowIndex: u.row.rowIndex,
        date: u.row.transactionDate,
        amount: u.row.depositAmount,
        description: u.row.description,
        depositId: u.depositId,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import bank statement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
