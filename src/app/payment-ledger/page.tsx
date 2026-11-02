'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { useAuth } from '@/components/AuthProvider';
import {
  isImageAttachment,
  ledgerAttachmentSrc,
  PAYMENT_LEDGER_CATEGORIES,
  PAYMENT_LEDGER_PAGE_SIZE,
  type PaymentLedgerAttachment,
  type PaymentLedgerCategory,
} from '@/lib/payment-ledger';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type LightboxImage = { src: string; name: string };

type Entry = {
  id: number;
  paid_date: string | null;
  amount: number | null;
  order_no: string | null;
  notes: string | null;
  link: string | null;
  attachments: PaymentLedgerAttachment[];
  category: PaymentLedgerCategory;
};

type SyncInfo = {
  configured: boolean;
  list_id: string;
  scan_page: number;
  watermark: string | null;
  webhook_secret_set?: boolean;
  webhook_path?: string;
  webhook_url?: string;
  last: {
    tasks_seen?: number;
    comment_fetches?: number;
    upserted?: number;
    cycle_complete?: boolean;
    errors?: string[];
    skipped?: string;
  } | null;
};

function formatAmount(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return amount.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FileChip({ name, href }: { name: string; href?: string }) {
  const className =
    'inline-flex max-w-[10rem] items-center truncate rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700';
  if (!href) return <span className={className}>{name}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${className} hover:bg-gray-100`}>
      {name}
    </a>
  );
}

export default function PaymentLedgerPage() {
  const { isSectionReadOnly } = useAuth();
  const readOnly = isSectionReadOnly('payment_ledger');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(() => new Set());
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [dateStart, dateEnd, category, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    if (category) params.set('category', category);
    if (debouncedSearch) params.set('q', debouncedSearch);
    params.set('limit', String(PAYMENT_LEDGER_PAGE_SIZE));
    params.set('offset', String((page - 1) * PAYMENT_LEDGER_PAGE_SIZE));
    fetch(`/api/payment-ledger?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (cancelled) return;
        setEntries(data.entries || []);
        setTotal(Number(data.total) || 0);
        setSync(data.sync || null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateStart, dateEnd, category, debouncedSearch, page, reloadKey]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
      if (event.key === 'ArrowRight') {
        setLightbox((current) =>
          current ? { ...current, index: (current.index + 1) % current.images.length } : current,
        );
      }
      if (event.key === 'ArrowLeft') {
        setLightbox((current) =>
          current
            ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length }
            : current,
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const filtersActive = Boolean(dateStart || dateEnd || category || debouncedSearch);
  const totalPages = Math.max(1, Math.ceil(total / PAYMENT_LEDGER_PAGE_SIZE));
  const pageStart = total ? (page - 1) * PAYMENT_LEDGER_PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(page * PAYMENT_LEDGER_PAGE_SIZE, total);

  const syncNow = async () => {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch('/api/payment-ledger/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setReloadKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const lastErrors = (sync?.last?.errors || []).filter((message) => message && message !== sync?.last?.skipped);

  const saveCategory = async (id: number, category: PaymentLedgerCategory) => {
    const previous = entries.find((row) => row.id === id)?.category;
    setEntries((current) => current.map((row) => (row.id === id ? { ...row, category } : row)));
    try {
      const res = await fetch(`/api/payment-ledger/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.entry) {
        setEntries((current) => {
          if (category && data.entry.category !== category) {
            return current.filter((row) => row.id !== id);
          }
          return current.map((row) => (row.id === id ? { ...row, ...data.entry } : row));
        });
        if (category && data.entry.category !== category) setTotal((current) => Math.max(0, current - 1));
      }
    } catch (err) {
      setEntries((current) =>
        current.map((row) => (row.id === id && previous ? { ...row, category: previous } : row)),
      );
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.paymentLedger}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi(
              'Nestiee wedding-gift payments recorded from ClickUp comments and payment fields.',
              '從 ClickUp 留言與付款欄位匯入的 Nestiee 婚宴回禮入帳。',
            )}
          </p>
        </div>
        {!readOnly && (
          <div className="page-actions">
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {syncing ? bi('Syncing…', '同步中…') : bi('Sync from ClickUp', '從 ClickUp 同步')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {sync && !sync.configured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {bi(
            'ClickUp API token is not set. Add it under Settings → Integrations → ClickUp, or set CLICKUP_API_TOKEN.',
            '尚未設定 ClickUp API token。請到 設定 → 整合 → ClickUp 填入，或設定 CLICKUP_API_TOKEN。',
          )}{' '}
          <Link href="/settings" className="font-medium underline">
            {bi('Open Settings', '開啟設定')}
          </Link>
          <span className="mt-1 block text-amber-800">
            {bi('List', '清單')} {sync.list_id}
            {sync.list_id === '901812202272' ? ' · Nestiee 婚宴回禮' : ''}
            {'. '}
            {bi('Override with CLICKUP_PAYMENT_LIST_ID if needed.', '如需改清單，設定 CLICKUP_PAYMENT_LIST_ID。')}
          </span>
        </div>
      )}

      {sync && (
        <div id="clickup-payment-setup" className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          <p className="font-medium text-gray-900">{bi('ClickUp setup', 'ClickUp 設定')}</p>
          <ul className="mt-2 space-y-1">
            <li>
              API token：{sync.configured ? bi('set', '已設定') : bi('not set', '未設定')}
            </li>
            <li>
              <code className="text-xs">CLICKUP_WEBHOOK_SECRET</code>：
              {sync.webhook_secret_set ? bi('set', '已設定') : bi('not set', '未設定')}
            </li>
            <li>
              {bi('List', '清單')} {sync.list_id}
              {sync.list_id === '901812202272' ? ' · Nestiee 婚宴回禮' : ''}
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span>{bi('Webhook URL', 'Webhook 網址')}</span>
              <code className="break-all text-xs">{sync.webhook_url || sync.webhook_path}</code>
              {sync.webhook_url ? (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-700 hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(sync.webhook_url || '').then(() => {
                      setCopiedUrl(true);
                      window.setTimeout(() => setCopiedUrl(false), 2000);
                    });
                  }}
                >
                  {copiedUrl ? bi('Copied', '已複製') : bi('Copy', '複製')}
                </button>
              ) : null}
            </li>
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            {bi(
              'Register that URL in ClickUp for this list with taskCommentPosted, taskCommentUpdated, and taskUpdated. Comments and the payment custom fields upsert here. Put webhook.secret in CLICKUP_WEBHOOK_SECRET. Steps and the create-webhook request are under Settings → API Integrations.',
              '在 ClickUp 為這個清單註冊該網址，事件為 taskCommentPosted、taskCommentUpdated、taskUpdated。留言與付款自訂欄位會寫入這裡。把 webhook.secret 設成 CLICKUP_WEBHOOK_SECRET。步驟與建立 webhook 的請求在 設定 → API Integrations。',
            )}{' '}
            <Link href="/settings#clickup" className="font-medium text-brand-700 underline">
              {bi('Open Settings', '開啟設定')}
            </Link>
          </p>
        </div>
      )}

      {sync?.last && sync.configured && (
        <p className="mb-4 text-xs text-gray-500">
          {bi('Last sync', '上次同步')}: {sync.last.tasks_seen ?? 0} {bi('tasks', '個任務')},{' '}
          {sync.last.comment_fetches ?? 0} {bi('comment threads', '則留言')}, {sync.last.upserted ?? 0}{' '}
          {bi('rows written', '筆寫入')}
          {sync.last.cycle_complete ? ` · ${bi('full list pass complete', '已掃完整個清單')}` : ''}
          {!sync.watermark ? ` · ${bi('first pass still walking the list', '首次同步仍在逐批掃描')}` : ''}
          {sync.scan_page > 0 ? ` · ${bi('page', '頁')} ${sync.scan_page}` : ''}
        </p>
      )}

      {lastErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lastErrors.slice(0, 3).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={bi('Order no., notes, amount…', '訂單編號、事由、金額…')}
        onClear={() => {
          setDateStart('');
          setDateEnd('');
          setCategory('');
          setSearch('');
        }}
      >
        <div className="flex flex-col min-w-0 sm:min-w-[8rem]">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Category', '類別')}</label>
          <select
            aria-label={bi('Category', '類別')}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full min-h-[44px] px-3 py-2.5 sm:px-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-brand-500 outline-none bg-white"
          >
            <option value="">{bi('All', '全部')}</option>
            {PAYMENT_LEDGER_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">{bi('Payment Ledger', '入帳紀錄')}</h2>
          {!loading && total > 0 && (
            <span className="text-xs text-gray-500">
              {bi(`${pageStart}–${pageEnd} of ${total}`, `${pageStart}–${pageEnd} / ${total} 筆`)}
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : total === 0 && !filtersActive ? (
          <div className="p-12 text-center text-gray-500">
            {bi(
              'No payment rows yet. Sync reads Nestiee 婚宴回禮 comments and the first / second payment fields.',
              '尚未有入帳。同步會讀取 Nestiee 婚宴回禮的付款留言，以及第一次／第二次付款欄位。',
            )}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi('No rows match these filters.', '沒有符合篩選條件的入帳。')}
          </div>
        ) : (
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="px-6 py-3">Paid Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Order No.</th>
                <th className="px-6 py-3">類別</th>
                <th className="px-6 py-3">Notes</th>
                <th className="px-6 py-3">Link</th>
                <th className="px-6 py-3">attachment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 align-middle">
                  <td className="px-6 py-3 align-middle text-sm text-gray-700 whitespace-nowrap">{row.paid_date || '—'}</td>
                  <td className="px-6 py-3 align-middle text-sm text-gray-900 tabular-nums whitespace-nowrap">{formatAmount(row.amount)}</td>
                  <td className="px-6 py-3 align-middle text-sm font-medium text-gray-900 whitespace-nowrap">{row.order_no || '—'}</td>
                  <td className="px-6 py-3 align-middle text-sm">
                    <select
                      aria-label="類別"
                      value={row.category || '回禮'}
                      disabled={readOnly}
                      onChange={(event) => saveCategory(row.id, event.target.value as PaymentLedgerCategory)}
                      className="min-h-[36px] rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 disabled:bg-gray-50"
                    >
                      {PAYMENT_LEDGER_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3 align-middle text-sm text-gray-700 max-w-xs whitespace-pre-line">{row.notes || '—'}</td>
                  <td className="px-6 py-3 align-middle text-sm">
                    {row.link ? (
                      <a href={row.link} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                        {BTN.open}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-3 align-middle text-sm text-gray-700">
                    <AttachmentCell
                      entryId={row.id}
                      attachments={row.attachments || []}
                      brokenThumbs={brokenThumbs}
                      onBroken={(key) =>
                        setBrokenThumbs((current) => {
                          const next = new Set(current);
                          next.add(key);
                          return next;
                        })
                      }
                      onOpen={(images, index) => setLightbox({ images, index })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
            aria-label={BTN.close}
          >
            ×
          </button>
          {lightbox.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightbox((current) =>
                    current
                      ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length }
                      : current,
                  );
                }}
                className="absolute left-2 z-10 h-12 w-12 rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 sm:left-6"
                aria-label={bi('Previous image', '上一張')}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightbox((current) =>
                    current ? { ...current, index: (current.index + 1) % current.images.length } : current,
                  );
                }}
                className="absolute right-2 z-10 h-12 w-12 rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 sm:right-6"
                aria-label={bi('Next image', '下一張')}
              >
                ›
              </button>
            </>
          )}
          <div className="flex max-h-[92vh] max-w-[92vw] flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.images[lightbox.index]?.src}
              alt={lightbox.images[lightbox.index]?.name || 'attachment'}
              className="max-h-[84vh] max-w-[92vw] cursor-default rounded-lg bg-white object-contain shadow-2xl"
            />
            <p className="max-w-[92vw] truncate text-sm text-white/80">
              {lightbox.images[lightbox.index]?.name}
              {lightbox.images.length > 1 ? ` · ${lightbox.index + 1} / ${lightbox.images.length}` : ''}
            </p>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

const THUMB_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Start the ClickUp proxy only when the thumb is near the viewport. */
function LazyThumb({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const ref = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={active ? src : THUMB_PLACEHOLDER}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={active ? onError : undefined}
      className="h-full w-full object-cover"
    />
  );
}

function AttachmentCell({
  entryId,
  attachments,
  brokenThumbs,
  onBroken,
  onOpen,
}: {
  entryId: number;
  attachments: PaymentLedgerAttachment[];
  brokenThumbs: Set<string>;
  onBroken: (key: string) => void;
  onOpen: (images: LightboxImage[], index: number) => void;
}) {
  if (!attachments.length) return <>—</>;

  const images = attachments
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => isImageAttachment(item) && !brokenThumbs.has(`${entryId}:${index}`));

  const openAt = (attachmentIndex: number) => {
    const gallery = images.map(({ item, index }) => ({
      src: ledgerAttachmentSrc(entryId, index, item, 'full'),
      name: item.name || 'attachment',
    }));
    const galleryIndex = images.findIndex(({ index }) => index === attachmentIndex);
    if (galleryIndex >= 0) onOpen(gallery, galleryIndex);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {attachments.map((item, index) => {
        const key = `${entryId}:${index}:${item.url || item.name}`;
        const thumbKey = `${entryId}:${index}`;
        const image = isImageAttachment(item) && !brokenThumbs.has(thumbKey);
        if (image) {
          const src = ledgerAttachmentSrc(entryId, index, item, 'thumb');
          return (
            <button
              key={key}
              type="button"
              onClick={() => openAt(index)}
              className="h-11 w-11 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50 cursor-zoom-in hover:ring-2 hover:ring-brand-400"
              aria-label={item.name || 'attachment'}
            >
              <LazyThumb src={src} alt={item.name || 'attachment'} onError={() => onBroken(thumbKey)} />
            </button>
          );
        }
        const href = item.url ? ledgerAttachmentSrc(entryId, index, item, 'full') : undefined;
        return <FileChip key={key} name={item.name || 'attachment'} href={href} />;
      })}
    </div>
  );
}
