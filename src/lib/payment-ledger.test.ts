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
  reviewSameDayPayments,
  SAME_DAY_UNCERTAIN_NOTE,
  selectCommentPaymentAmounts,
  type PaymentLedgerDraft,
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

/** Order 11124, 2026-10-24. One comment; the ledger was booking 5337 + 1835 + 1835. */
const ORDER_11124_ADDON_NOTES =
  '加單金額：$1,835；原單已標記 100% Full Paid，因此只記錄加單金額，未加入尾數欄位。 · 【🔁 回禮樽訂單尾數確認】 · 加單金額：$1,835 · 總額：$5,337 · 轉數快 FPS ID：110700226 (Honour Label Limited)';

describe('parsePaymentAmounts', () => {
  it('keeps payment totals and skips per-bottle prices', () => {
    expect(parsePaymentAmounts('已付 $829.40')).toEqual([829.4]);
    expect(parsePaymentAmounts('總額：$6,288.90')).toEqual([6288.9]);
    expect(parsePaymentAmounts('$4,976@$41.47/樽 (原價$45/樽)')).toEqual([4976]);
  });

  it('still lists every dollar figure, including a repeated 加單金額 and the 總額', () => {
    expect(parsePaymentAmounts(ORDER_11124_ADDON_NOTES)).toEqual([1835, 1835, 5337]);
  });
});

describe('selectCommentPaymentAmounts', () => {
  it('books the 加單金額 once and ignores 總額 on the order 11124 notes', () => {
    expect(selectCommentPaymentAmounts(ORDER_11124_ADDON_NOTES)).toEqual([1835]);
  });

  it('dedupes a repeated 加單金額 and keeps two different add-on figures', () => {
    expect(selectCommentPaymentAmounts('加单金额：HK$200.00\n加单金额：$200\n總額：$900')).toEqual([200]);
    expect(selectCommentPaymentAmounts('加單金額：$100\n加單金額：$40\n總額：$9,000')).toEqual([100, 40]);
    expect(selectCommentPaymentAmounts('加單金額：$45/樽\n總額：$900')).toEqual([]);
    expect(selectCommentPaymentAmounts('已付 $100 · 尾數 $40')).toEqual([100, 40]);
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
    expect(rows[0].category).toBe('回禮');
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

  it('books order 11124 加單 notes as one row for 1835', () => {
    const rows = extractPaymentLedgerRows(task({ id: 't11124', name: '11124 - wedding 回禮' }), [
      {
        id: 'c11124',
        comment_text: ORDER_11124_ADDON_NOTES,
        date: '1792814400000',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dedupe_key: 'comment:t11124:c11124',
      paid_date: '2026-10-24',
      amount: 1835,
      order_no: '11124',
      source: 'comment',
      category: '回禮',
    });
    expect(rows[0].notes).toContain('加單金額：$1,835');
    expect(rows[0].notes).toContain('總額：$5,337');
    expect(rows.some((row) => row.amount === 5337)).toBe(false);
  });

  it('keeps the 加單 row beside an installment and does not book 總額', () => {
    const rows = extractPaymentLedgerRows(
      task({
        id: 't11124b',
        name: '11124 - wedding 回禮',
        custom_fields: [
          labels(['Full Paid']),
          { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1792180800000' },
          { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '3502' },
        ],
      }),
      [{ id: 'c11124', comment_text: ORDER_11124_ADDON_NOTES, date: '1792814400000' }],
    );
    expect(rows.map((row) => [row.source, row.amount, row.dedupe_key])).toEqual([
      ['installment', 3502, 'installment:t11124b:1'],
      ['comment', 1835, 'comment:t11124b:c11124'],
    ]);
  });

  it('still records each amount when one comment lists two different payments', () => {
    const rows = extractPaymentLedgerRows(task({ id: 'multi', name: '12001 - two payments' }), [
      { id: 'c', comment_text: '已付 $100 · 尾數 $40', date: '1792255649598' },
    ]);
    expect(rows.map((row) => [row.dedupe_key, row.amount])).toEqual([
      ['comment:multi:c:0', 100],
      ['comment:multi:c:1', 40],
    ]);
  });

  it('keeps distinct 加單金額 figures and still ignores 總額', () => {
    const rows = extractPaymentLedgerRows(task({ id: 'addon2', name: '11125' }), [
      { id: 'c', comment_text: '加單金額：$100\n加單金額：$40\n總額：$9,000', date: '1792255649598' },
    ]);
    expect(rows.map((row) => row.amount)).toEqual([100, 40]);
    expect(rows.map((row) => row.dedupe_key)).toEqual(['comment:addon2:c:0', 'comment:addon2:c:1']);
    expect(rows.some((row) => row.amount === 9000)).toBe(false);
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

function draft(partial: Partial<PaymentLedgerDraft> & Pick<PaymentLedgerDraft, 'dedupe_key'>): PaymentLedgerDraft {
  return {
    paid_date: '2026-08-10',
    amount: null,
    order_no: '10949',
    notes: '',
    link: '',
    attachments: [],
    clickup_task_id: 't',
    source: partial.dedupe_key.startsWith('comment') ? 'comment' : 'installment',
    category: '回禮',
    ...partial,
  };
}

const receiptFile = { name: 'receipt.png', url: 'https://cdn.example/receipt.png' };

describe('reviewSameDayPayments', () => {
  const first = draft({
    dedupe_key: 'installment:t:1',
    paid_date: '2026-08-10',
    amount: 1000,
    notes: '第一次付款',
  });
  const second = draft({
    dedupe_key: 'installment:t:2',
    paid_date: '2026-09-29',
    amount: 500,
    notes: '第二次付款',
  });

  it('treats an amount within $1 as one payment and folds onto that installment', () => {
    const comment = draft({
      dedupe_key: 'comment:t:c',
      paid_date: '2026-08-10',
      amount: 1000.8,
      notes: '已付 $1000.80',
      attachments: [receiptFile],
    });
    expect(reviewSameDayPayments(comment, [first, second])).toEqual({
      decision: 'one',
      dedupe_key: 'installment:t:1',
    });
    expect(reviewSameDayPayments({ ...comment, amount: 1001 }, [first])).toEqual({
      decision: 'one',
      dedupe_key: 'installment:t:1',
    });
  });

  it('keeps a different amount, 加單, or 尾數 as its own row', () => {
    expect(
      reviewSameDayPayments(
        draft({
          dedupe_key: 'comment:t:diff',
          paid_date: '2026-08-10',
          amount: 829.4,
          notes: '已付 $829.40',
          attachments: [receiptFile],
        }),
        [first, second],
      ),
    ).toEqual({ decision: 'two' });
    expect(
      reviewSameDayPayments(
        draft({
          dedupe_key: 'comment:t:addon',
          paid_date: '2026-08-10',
          amount: 1000,
          notes: '加單金額：$1,000',
          attachments: [receiptFile],
        }),
        [first],
      ),
    ).toEqual({ decision: 'two' });
    expect(
      reviewSameDayPayments(
        draft({
          dedupe_key: 'comment:t:balance',
          paid_date: '2026-09-29',
          amount: 500,
          notes: '尾數 $500',
          attachments: [receiptFile],
        }),
        [first, second],
      ),
    ).toEqual({ decision: 'two' });
    expect(
      reviewSameDayPayments(
        draft({ dedupe_key: 'comment:t:far', paid_date: '2026-08-10', amount: 1001.01, notes: '已付 $1001.01' }),
        [first],
      ),
    ).toEqual({ decision: 'two' });
  });

  it('folds a Full/50% receipt or a named installment receipt when there is no separate amount', () => {
    expect(
      reviewSameDayPayments(
        draft({
          dedupe_key: 'comment:t:full',
          paid_date: '2026-08-10',
          notes: '100% Full payment',
          attachments: [receiptFile],
        }),
        [first, second],
      ),
    ).toEqual({ decision: 'one', dedupe_key: 'installment:t:1' });
    const secondSameDay = { ...second, paid_date: '2026-08-10' };
    expect(
      reviewSameDayPayments(
        draft({
          dedupe_key: 'comment:t:slot2',
          paid_date: '2026-08-10',
          notes: '第二次收據',
          attachments: [receiptFile],
        }),
        [first, secondSameDay],
      ),
    ).toEqual({ decision: 'one', dedupe_key: 'installment:t:2' });
  });

  it('does not treat a same-day comment as the installment when the link is unclear', () => {
    expect(
      reviewSameDayPayments(
        draft({
          dedupe_key: 'comment:t:vague',
          paid_date: '2026-08-10',
          notes: '銀行轉帳',
          attachments: [{ name: 'image.png', url: '' }],
        }),
        [first, second],
      ),
    ).toEqual({ decision: 'uncertain' });
    expect(
      reviewSameDayPayments(
        draft({ dedupe_key: 'comment:t:other', paid_date: '2026-10-18', notes: '100% Full payment' }),
        [first],
      ),
    ).toEqual({ decision: 'not-same-day' });
  });
});

describe('same-day ledger rows', () => {
  it('folds a same-day receipt when the amount is within $1', () => {
    const rows = extractPaymentLedgerRows(
      task({
        id: 'near',
        name: '12010',
        custom_fields: [
          { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1786305600000' },
          { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '1000' },
        ],
      }),
      [
        {
          id: 'c',
          comment_text: '已付 $1000.80\nimage.png',
          date: '1786364209075',
          comment: [
            {
              type: 'image',
              text: 'image.png',
              image: { id: 'r1', name: 'image.png', url: 'https://cdn.example/r.png' },
            },
          ],
        },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dedupe_key: 'installment:near:1',
      paid_date: '2026-08-10',
      amount: 1000,
      source: 'installment',
    });
    expect(rows[0].attachments.map((item) => item.url)).toEqual(['https://cdn.example/r.png']);
    expect(rows[0].notes).not.toContain(SAME_DAY_UNCERTAIN_NOTE);
  });

  it('keeps a same-day 尾數 receipt on its own row even when the amount matches', () => {
    const rows = extractPaymentLedgerRows(
      task({
        id: 'bal',
        name: '12011',
        custom_fields: [
          { id: 'd2', name: '第二次Payment日期', type: 'date', value: '1790625600000' },
          { id: 'a2', name: '第2次Payment($)', type: 'number', value: '500' },
        ],
      }),
      [
        {
          id: 'c',
          comment_text: '尾數 $500\nreceipt.png',
          date: '1790651369825',
          comment: [
            {
              type: 'image',
              text: 'receipt.png',
              image: { id: 'b1', name: 'receipt.png', url: 'https://cdn.example/balance.png' },
            },
          ],
        },
      ],
    );
    const installment = rows.find((row) => row.source === 'installment');
    const comment = rows.find((row) => row.source === 'comment');
    expect(installment?.attachments).toEqual([]);
    expect(installment?.notes).not.toContain(SAME_DAY_UNCERTAIN_NOTE);
    expect(comment).toMatchObject({
      dedupe_key: 'comment:bal:c',
      paid_date: '2026-09-29',
      amount: 500,
    });
    expect(comment?.attachments.map((item) => item.url)).toEqual(['https://cdn.example/balance.png']);
    expect(comment?.notes).not.toContain(SAME_DAY_UNCERTAIN_NOTE);
  });

  it('keeps a same-day 加單 row and still books only the add-on amount', () => {
    const rows = extractPaymentLedgerRows(
      task({
        id: 'addon-day',
        name: '11124 - wedding 回禮',
        custom_fields: [
          labels(['Full Paid']),
          { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1792814400000' },
          { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '1835' },
        ],
      }),
      [{ id: 'c11124', comment_text: ORDER_11124_ADDON_NOTES, date: '1792814400000' }],
    );
    expect(rows.map((row) => [row.source, row.amount, row.dedupe_key])).toEqual([
      ['installment', 1835, 'installment:addon-day:1'],
      ['comment', 1835, 'comment:addon-day:c11124'],
    ]);
    expect(rows.some((row) => row.amount === 5337)).toBe(false);
    expect(rows.some((row) => row.notes.includes(SAME_DAY_UNCERTAIN_NOTE))).toBe(false);
  });

  it('leaves both rows and writes the uncertain note when the same day is not enough', () => {
    const rows = extractPaymentLedgerRows(
      task({
        id: 'unsure',
        name: '12012',
        custom_fields: [
          labels(['Full Paid']),
          { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1786305600000' },
          { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '4976' },
          { id: 'd2', name: '第二次Payment日期', type: 'date', value: '1790625600000' },
          { id: 'a2', name: '第2次Payment($)', type: 'number', value: '1658.8' },
        ],
      }),
      [
        {
          id: 'c',
          comment_text: '銀行轉帳\nimage.png',
          date: '1786364209075',
        },
      ],
    );
    const first = rows.find((row) => row.dedupe_key === 'installment:unsure:1');
    const second = rows.find((row) => row.dedupe_key === 'installment:unsure:2');
    const comment = rows.find((row) => row.source === 'comment');
    expect(comment).toMatchObject({
      dedupe_key: 'comment:unsure:c',
      paid_date: '2026-08-10',
      amount: null,
      notes: `銀行轉帳 · ${SAME_DAY_UNCERTAIN_NOTE}`,
    });
    expect(comment?.attachments.map((item) => item.name)).toEqual(['image.png']);
    expect(first?.notes).toBe(`Full Paid · 第一次付款 · ${SAME_DAY_UNCERTAIN_NOTE}`);
    expect(second?.notes).toBe('Full Paid · 第二次付款');
    expect(second?.paid_date).toBe('2026-09-29');
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
    expect(afterFirst[0].category).toBe('回禮');

    const { updatePaymentLedgerCategory } = await import('./payment-ledger-server');
    const edited = await updatePaymentLedgerCategory(TEST_USER_ID, afterFirst[0].id, '燕窩');
    expect(edited?.category).toBe('燕窩');

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
    expect(afterThird[0].category).toBe('燕窩');
  });
});
