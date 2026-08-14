import * as XLSX from 'xlsx';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { PAYMENT_METHOD_LABELS } from '@/lib/reconciliation';
import { listReconciliationRecords } from '@/lib/reconciliation-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ownerId = await getDataOwnerId(session.userId);
  const records = await listReconciliationRecords(ownerId);

  const url = new URL(request.url);
  const zone = url.searchParams.get('zone')?.trim() || '';
  const method = url.searchParams.get('method')?.trim() || '';
  const dateStart = url.searchParams.get('dateStart')?.trim() || '';
  const dateEnd = url.searchParams.get('dateEnd')?.trim() || '';
  const q = url.searchParams.get('q')?.trim().toLowerCase() || '';

  const filtered = records.filter((r) => {
    if (zone === 'high' && !(r.status === 'Pending Approval' && r.confidence === 'high')) return false;
    if (zone === 'medium' && !(r.status === 'Pending Approval' && r.confidence === 'medium')) return false;
    if (zone === 'attention' && !(r.status === 'Unmatched' || r.status === 'Discrepancy')) return false;
    if (zone === 'matched' && r.status !== 'Matched') return false;
    if (method && r.payment_method !== method) return false;
    const d = r.deposit_time.replace('T', ' ').slice(0, 10);
    if (dateStart && d < dateStart) return false;
    if (dateEnd && d > dateEnd) return false;
    if (q) {
      const hay = [
        r.order_no,
        r.invoice_number,
        r.suggested_order_no,
        r.suggested_invoice_number,
        r.suggested_customer_name,
        r.remarks,
        r.created_by,
        r.approved_by,
        r.payment_method,
        r.status,
        String(r.gross_amount),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const headers = [
    '入帳日期',
    '銀碼',
    '付款方式',
    '手續費',
    '淨額',
    'Invoice',
    'Order',
    '客戶',
    'Status',
    'Confidence',
    'Source',
    '備註',
    '建立日期',
    '上傳人',
    '核准人',
    '核准時間',
  ];

  const data = filtered.map((r) => {
    const matched = r.status === 'Matched';
    return {
      入帳日期: r.deposit_time,
      銀碼: r.gross_amount,
      付款方式: PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method,
      手續費: r.transaction_fee,
      淨額: r.net_amount,
      Invoice: matched ? r.invoice_number || '' : r.suggested_invoice_number || '',
      Order: matched ? r.order_no || '' : r.suggested_order_no || r.order_no || '',
      客戶: r.suggested_customer_name || '',
      Status: r.status,
      Confidence: r.confidence || '',
      Source: r.source,
      備註: r.remarks || '',
      建立日期: r.created_at,
      上傳人: r.created_by || '',
      核准人: r.approved_by || '',
      核准時間: r.approved_at || '',
    };
  });

  const ws = data.length
    ? XLSX.utils.json_to_sheet(data)
    : XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = [
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
    { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().split('T')[0];

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reconciliation-${date}.xlsx"`,
    },
  });
}
