import { beforeEach, describe, expect, it } from 'vitest';
import type { ClickUpComment, ClickUpTask } from './clickup';
import {
  attachmentsFromClickUpComment,
  commentLooksLikePayment,
  extractPaymentLedgerRows,
  isImageAttachment,
  ledgerAttachmentSrc,
  orderNoFromTaskTitle,
  parsePaymentAmounts,
} from './payment-ledger';

function task(partial: Partial<ClickUpTask> & Pick<ClickUpTask, 'id' | 'name'>): ClickUpTask {
  return {
    url: `https://app.clickup.com/t/${partial.id}`,
    custom_fields: [],
    ...partial,
  };
}

function labels(names: string[]) {
  return {
    id: 'payment',
    name: 'Payment',
    type: 'labels',
    value: names.map((label, index) => `opt-${index}`),
    type_config: {
      options: names.map((label, index) => ({ id: `opt-${index}`, label })),
    },
  };
}

const shirley = task({
  id: 'z94x8e8u0a',
  name: '12104 - Shirley Ho & Billy Yu 6808 6996 - 20261122 45ml 110樽 + 25ml 50樽',
  date_updated: '1793182594511',
  custom_fields: [
    labels(['Full Paid']),
    { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1792180800000' },
    { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '6288.5' },
    { id: 'ord', name: 'Order #', type: 'short_text', value: '12104' },
  ],
});

const fullPaymentComment: ClickUpComment = {
  id: '1100780000247383',
  comment_text: 'image.png\n100% Full payment\n',
  date: '1792255649598',
  comment: [
    { text: 'image.png' },
    { text: '\n' },
    { text: '100% Full payment' },
    {
      type: 'image',
      text: 'image.png',
      image: {
        id: 'img-1',
        name: 'image.png',
        url: 'https://attachments.example/image.png',
      },
    },
  ],
};

describe('orderNoFromTaskTitle', () => {
  it('reads the title prefix and ignores the phone', () => {
    expect(orderNoFromTaskTitle('12104 - Shirley Ho & Billy Yu 6808 6996 - 20261122')).toBe('12104');
    expect(orderNoFromTaskTitle('10949-Helen and Brian 62373086 - 20261104')).toBe('10949');
    expect(orderNoFromTaskTitle('散水 - 11931-Anne Siu 9878 1105')).toBe('11931');
    expect(orderNoFromTaskTitle('12046 01 - 陳小姐/黃太 - 9429 5818')).toBe('12046');
  });

  it('falls back to the Order # field', () => {
    expect(orderNoFromTaskTitle('no digits here', '12104')).toBe('12104');
  });
});

describe('parsePaymentAmounts', () => {
  it('keeps payment totals and skips per-bottle prices', () => {
    expect(parsePaymentAmounts('已付 $829.40')).toEqual([829.4]);
    expect(parsePaymentAmounts('總額：$6,288.90')).toEqual([6288.9]);
    expect(parsePaymentAmounts('$4,976@$41.47/樽 (原價$45/樽)')).toEqual([4976]);
  });
});

describe('attachment previews', () => {
  it('keeps every photo even when ClickUp names them all image.png', () => {
    const files = attachmentsFromClickUpComment({
      id: 'c1',
      comment_text: 'image.png\nimage.png\nFull payment\n',
      comment: [
        {
          type: 'image',
          text: 'image.png',
          image: {
            id: 'a',
            name: 'image.png',
            url: 'https://cdn.example/a.png',
            thumbnail_small: 'https://cdn.example/a-thumb.png',
          },
        },
        {
          type: 'image',
          text: 'image.png',
          image: { id: 'b', name: 'image.png', url: 'https://cdn.example/b.png' },
        },
      ],
    });
    expect(files.map((file) => file.url)).toEqual(['https://cdn.example/a.png', 'https://cdn.example/b.png']);
    expect(files[0].thumbnail_url).toBe('https://cdn.example/a-thumb.png');
    expect(isImageAttachment(files[0])).toBe(true);
    expect(isImageAttachment({ name: 'note.pdf', url: 'https://cdn.example/note.pdf' })).toBe(false);
    expect(isImageAttachment({ name: 'image.png', url: '' })).toBe(false);
    expect(ledgerAttachmentSrc(4, 0, files[0], 'thumb')).toBe('https://cdn.example/a-thumb.png');
    expect(
      ledgerAttachmentSrc(4, 1, {
        name: 'image.png',
        url: 'https://t1.p.clickup-attachments.com/t1/x/image.png',
      }, 'full'),
    ).toBe('/api/payment-ledger/files?id=4&index=1&variant=full');
    expect(isClickUpSafe('https://evil.com/image.png')).toBe(false);
  });
});

function isClickUpSafe(url: string): boolean {
  return ledgerAttachmentSrc(1, 0, { name: 'image.png', url }, 'full').startsWith('/api/');
}

describe('extractPaymentLedgerRows', () => {
  it('maps the first payment installment and folds the receipt comment into that row', () => {
    const rows = extractPaymentLedgerRows(shirley, [
      fullPaymentComment,
      { id: 'plain', comment_text: 'image.png\n', date: '1793005316928' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dedupe_key: 'installment:z94x8e8u0a:1',
      paid_date: '2026-10-17',
      amount: 6288.5,
      order_no: '12104',
      source: 'installment',
      link: 'https://app.clickup.com/t/z94x8e8u0a',
    });
    expect(rows[0].notes).toContain('Full Paid');
    expect(rows[0].notes).toContain('100% Full payment');
    expect(rows[0].attachments).toEqual([
      { name: 'image.png', url: 'https://attachments.example/image.png', id: 'img-1' },
    ]);
  });

  it('keeps a second installment and extra-charge comments as separate rows', () => {
    const helen = task({
      id: '86eyk490j',
      name: '10949-Helen and Brian 62373086 - 20261104 45ml, 120樽 > 140樽',
      custom_fields: [
        labels(['Full Paid']),
        { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1786305600000' },
        { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '4976' },
        { id: 'd2', name: '第二次Payment日期', type: 'date', value: '1790625600000' },
        { id: 'a2', name: '第2次Payment($)', type: 'number', value: '1658.8' },
      ],
    });
    const rows = extractPaymentLedgerRows(helen, [
      {
        id: 'c-extra',
        comment_text: 'image.png\n加20樽金額\n',
        date: '1792057457734',
      },
      {
        id: 'c-file',
        comment_text: 'Helen and Brian Full Payment.jpeg\nHelen and Brian Full Payment\n',
        date: '1786364209075',
      },
      {
        id: 'c-paid',
        comment_text: '已付 $829.40',
        date: '1790651369825',
      },
    ]);
    const byKey = Object.fromEntries(rows.map((row) => [row.dedupe_key, row]));
    expect(byKey['installment:86eyk490j:1']).toMatchObject({
      paid_date: '2026-08-10',
      amount: 4976,
      order_no: '10949',
    });
    expect(byKey['installment:86eyk490j:1'].attachments.map((item) => item.name)).toContain(
      'Helen and Brian Full Payment.jpeg',
    );
    expect(byKey['installment:86eyk490j:2']).toMatchObject({
      paid_date: '2026-09-29',
      amount: 1658.8,
      order_no: '10949',
    });
    expect(byKey['comment:86eyk490j:c-extra']).toMatchObject({
      paid_date: '2026-10-15',
      amount: null,
      order_no: '10949',
      notes: '加20樽金額',
    });
    expect(byKey['comment:86eyk490j:c-paid']).toMatchObject({
      amount: 829.4,
      notes: '已付 $829.40',
    });
    expect(rows.filter((row) => row.dedupe_key.startsWith('comment:86eyk490j:c-file'))).toHaveLength(0);
  });

  it('does not insert the same comment or installment twice', () => {
    const once = extractPaymentLedgerRows(shirley, [fullPaymentComment]);
    const twice = extractPaymentLedgerRows(shirley, [fullPaymentComment, fullPaymentComment]);
    expect(once.map((row) => row.dedupe_key)).toEqual(twice.map((row) => row.dedupe_key));
    expect(new Set(twice.map((row) => row.dedupe_key)).size).toBe(twice.length);
  });

  it('ignores quotation dumps, unpaid labels, and bare screenshots', () => {
    expect(commentLooksLikePayment('image.png\n', ['image.png'])).toBe(false);
    const quote = `【即食燕窩回禮 Confirmation】\n總額：$4,976\nFPS 識別碼: 110700226\n原價$45/樽\n${'x'.repeat(200)}`;
    expect(commentLooksLikePayment(quote, [])).toBe(false);
    const unpaid = task({
      id: 'unpaid',
      name: '12165 - Joyce',
      custom_fields: [labels(['未付款'])],
    });
    expect(extractPaymentLedgerRows(unpaid, [])).toEqual([]);
  });

  it('records a paid label even before an amount is filled in', () => {
    const labeled = task({
      id: 'label-only',
      name: '12042 - Bonnie',
      custom_fields: [labels(['50% payment', 'FPS'])],
    });
    const rows = extractPaymentLedgerRows(labeled, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toContain('50% payment');
    expect(rows[0].notes).toContain('FPS');
    expect(rows[0].amount).toBeNull();
  });
});

const hasDb = Boolean(process.env.DATABASE_URL?.trim());
const TEST_USER_ID = 99941;

describe.skipIf(!hasDb)('syncPaymentLedger', () => {
  beforeEach(async () => {
    const db = (await import('./db')).default;
    await db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);
    await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      TEST_USER_ID,
      `ledger-${TEST_USER_ID}@example.com`,
      'hash',
      'Ledger Test',
    );
  });

  it('persists a batch once and updates the installment in place', async () => {
    const { syncPaymentLedger, listPaymentLedger } = await import('./payment-ledger-server');
    const current = {
      ...shirley,
      date_updated: '1',
    };
    let commentCalls = 0;
    const client = {
      async listPage(page: number, opts?: { date_updated_gt?: string }) {
        if (opts?.date_updated_gt) return { tasks: [], hasMore: false };
        if (page > 0) return { tasks: [], hasMore: false };
        return { tasks: [current], hasMore: false };
      },
      async comments() {
        commentCalls += 1;
        return [fullPaymentComment];
      },
    };

    const first = await syncPaymentLedger(TEST_USER_ID, client);
    expect(first.comment_fetches).toBe(1);
    expect(first.errors).toEqual([]);
    const afterFirst = await listPaymentLedger(TEST_USER_ID);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].amount).toBe(6288.5);
    expect(afterFirst[0].order_no).toBe('12104');

    const second = await syncPaymentLedger(TEST_USER_ID, client);
    expect(second.comment_fetches).toBe(0);
    expect(commentCalls).toBe(1);
    expect(await listPaymentLedger(TEST_USER_ID)).toHaveLength(1);

    current.date_updated = '2';
    current.custom_fields = (current.custom_fields || []).map((field) =>
      field.name === '第一次Payment ($)' ? { ...field, value: '7000' } : field,
    );
    const third = await syncPaymentLedger(TEST_USER_ID, client);
    expect(third.comment_fetches).toBe(1);
    const afterThird = await listPaymentLedger(TEST_USER_ID);
    expect(afterThird).toHaveLength(1);
    expect(afterThird[0].amount).toBe(7000);
    expect(afterThird[0].order_no).toBe('12104');
  });
});
