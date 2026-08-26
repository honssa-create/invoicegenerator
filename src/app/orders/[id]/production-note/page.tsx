'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import ProductionNotePreview from '@/components/ProductionNotePreview';
import { orderFileUrl } from '@/lib/image-url';
import { compressImage } from '@/lib/imageCompression';
import {
  composeProductionNotePng,
  DEFAULT_TEXT_OFFSET,
  downloadBlob,
  formatProductionNoteShipDate,
  isoFromProductionNoteShipDate,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  normalizeTextColor,
  prefillProductionNote,
  PRODUCTION_NOTE_COLOR_SWATCHES,
  PRODUCTION_NOTE_FILENAME,
  clampFontScale,
  type ProductionNoteFields,
  type ProductionNoteTextOffset,
} from '@/lib/production-note';
import { isBadgeOrderType, type Order, type OrderFile } from '@/lib/orders';
import { bi, BTN } from '@/lib/ui-labels';

type EffectSource =
  | { kind: 'file'; file: OrderFile; src: string }
  | { kind: 'local'; src: string; name: string };

export default function ProductionNotePage() {
  const { id } = useParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState('');
  const [fields, setFields] = useState<ProductionNoteFields>({
    po: '',
    details: '',
    quantity: '',
    price: '',
    shipDate: '',
  });
  const [textOffset, setTextOffset] = useState<ProductionNoteTextOffset>(DEFAULT_TEXT_OFFSET);
  const [effect, setEffect] = useState<EffectSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');

  const localBlobRef = useRef<string | null>(null);

  const revokeLocal = () => {
    if (localBlobRef.current) {
      URL.revokeObjectURL(localBlobRef.current);
      localBlobRef.current = null;
    }
  };

  useEffect(() => () => revokeLocal(), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orders/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Order not found');
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        const o = d?.order as Order | undefined;
        if (!o) throw new Error('Order not found');
        setOrder(o);
        setFields(prefillProductionNote(o));
        const orderType = String(o.fields?.order_type || '');
        if (!isBadgeOrderType(orderType)) {
          setLoadError(bi('Production notes are only for honour / honour en orders', '生產單僅適用於 honour / honour en 訂單'));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(bi('Failed to load order', '載入訂單失敗'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const setField = <K extends keyof ProductionNoteFields>(key: K, value: ProductionNoteFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  const selectExisting = (file: OrderFile) => {
    revokeLocal();
    setEffect({ kind: 'file', file, src: orderFileUrl(file) });
    setTextOffset((s) => ({ ...s, x: DEFAULT_TEXT_OFFSET.x, y: DEFAULT_TEXT_OFFSET.y }));
    setMsg('');
  };

  const onUploadEffect = async (list: FileList | null) => {
    const raw = list?.[0];
    if (!raw) return;
    setUploadMsg(bi('Optimising…', '優化中…'));
    try {
      let file = raw;
      if (raw.type.startsWith('image/') && raw.type !== 'image/gif') {
        const c = await compressImage(raw, { maxDim: 2400, targetBytes: 2 * 1024 * 1024, mimeType: 'image/jpeg', quality: 0.9 });
        file = c.file;
      }
      revokeLocal();
      const src = URL.createObjectURL(file);
      localBlobRef.current = src;
      setEffect({ kind: 'local', src, name: file.name || 'effect.png' });
      setTextOffset((s) => ({ ...s, x: DEFAULT_TEXT_OFFSET.x, y: DEFAULT_TEXT_OFFSET.y }));
      setMsg('');

      // Also add to order attachments so it appears in the picker afterwards
      if (order) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/orders/${order.id}/files`, { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          const files = data.files as OrderFile[];
          setOrder((o) => (o ? { ...o, files } : o));
          const newest = files[files.length - 1];
          if (newest) {
            revokeLocal();
            setEffect({ kind: 'file', file: newest, src: orderFileUrl(newest) });
          }
        }
      }
    } catch {
      setMsg(bi('Failed to load image', '載入圖片失敗'));
    }
    setUploadMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const proofFiles = useMemo(() => {
    if (!order) return [];
    return order.files.filter((f) => (f.original_name || '').trim() !== PRODUCTION_NOTE_FILENAME);
  }, [order]);

  const handleDownload = useCallback(async () => {
    if (!order || !effect) {
      setMsg(bi('Please select an effect image first', '請先選擇效果圖'));
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const blob = await composeProductionNotePng({
        imageSrc: effect.src,
        fields,
        textOffset,
      });

      downloadBlob(blob, PRODUCTION_NOTE_FILENAME);

      // Replace prior 生產單.png then upload
      const existing = order.files.filter(
        (f) => (f.original_name || '').trim() === PRODUCTION_NOTE_FILENAME
      );
      for (const f of existing) {
        await fetch(`/api/order-files/${f.id}`, { method: 'DELETE' });
      }

      const fd = new FormData();
      fd.append('file', new File([blob], PRODUCTION_NOTE_FILENAME, { type: 'image/png' }));
      const res = await fetch(`/api/orders/${order.id}/files`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || bi('Failed to save attachment', '儲存附件失敗'));
      }
      const data = await res.json();
      setOrder((o) => (o ? { ...o, files: data.files } : o));

      fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          id: order.id,
          body: 'Generated production note (生產單)',
        }),
      }).catch(() => {});

      setMsg(bi('Downloaded and saved to attachments', '已下載並存入附件'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : bi('Failed to generate note', '產生生產單失敗'));
    } finally {
      setBusy(false);
    }
  }, [order, effect, fields, textOffset]);

  if (loadError && !order) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
          <p className="text-red-600">{loadError}</p>
          <Link href="/orders" className="text-brand-600 hover:underline text-sm">
            ← {bi('Back to orders', '返回訂單')}
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout>
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppLayout>
    );
  }

  const softInput =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400';

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <div>
          <Link href={`/orders/${order.id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to order', '返回訂單')}
          </Link>
          <h1 className="text-xl font-semibold text-gray-900 mt-2">{bi('Production Note', '生產單')}</h1>
          {loadError && <p className="text-sm text-amber-700 mt-1">{loadError}</p>}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => router.push(`/orders/${order.id}`)}
            className="btn border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
          >
            {BTN.cancel}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy || !!loadError}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 w-full sm:w-auto"
          >
            {busy ? bi('Working…', '處理中…') : bi('Download', '下載')}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            msg.includes('失敗') || msg.toLowerCase().includes('fail') || msg.includes('請先')
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}
        >
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 items-start">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-700">PO#</span>
            <input
              value={fields.po}
              onChange={(e) => setField('po', e.target.value)}
              className={softInput}
              placeholder="#H3326"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-700">{bi('Production details', '生產細節')}</span>
            <textarea
              value={fields.details}
              onChange={(e) => setField('details', e.target.value)}
              rows={3}
              className={softInput}
              placeholder="e.g. 52.5MM, 雙層雙面, 四節圓扣"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">{bi('Quantity', '數量')}</span>
              <input
                value={fields.quantity}
                onChange={(e) => setField('quantity', e.target.value)}
                className={softInput}
                placeholder="103"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700">{bi('Price', '價錢')}</span>
              <input
                value={fields.price}
                onChange={(e) => setField('price', e.target.value)}
                className={softInput}
                placeholder="RMB 3.2"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-700">{bi('Ship date', '寄出日子')}</span>
            <input
              type="date"
              value={isoFromProductionNoteShipDate(fields.shipDate)}
              onChange={(e) => setField('shipDate', formatProductionNoteShipDate(e.target.value))}
              className={softInput}
            />
          </label>

          <div className="space-y-3 pt-2 border-t border-dashed border-gray-200">
            <p className="text-sm font-medium text-gray-700">{bi('Text style', '文字樣式')}</p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-gray-500">{bi('Size', '大小')}</span>
              <input
                type="range"
                min={MIN_FONT_SCALE}
                max={MAX_FONT_SCALE}
                step={0.002}
                value={clampFontScale(textOffset.fontScale)}
                onChange={(e) =>
                  setTextOffset({ ...textOffset, fontScale: Number(e.target.value) })
                }
                className="w-full accent-brand-600"
              />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-500">{bi('Color', '顏色')}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={normalizeTextColor(textOffset.color)}
                  onChange={(e) => setTextOffset({ ...textOffset, color: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
                  aria-label={bi('Text color', '文字顏色')}
                />
                {PRODUCTION_NOTE_COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTextOffset({ ...textOffset, color: c })}
                    className={`h-8 w-8 rounded-full border shadow-sm ${
                      normalizeTextColor(textOffset.color) === normalizeTextColor(c)
                        ? 'ring-2 ring-brand-500 ring-offset-1'
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-dashed border-gray-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">{bi('Effect image', '效果圖')}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {bi('Upload', '上傳')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onUploadEffect(e.target.files)}
              />
            </div>
            {uploadMsg && <p className="text-xs text-brand-700">{uploadMsg}</p>}
            {effect?.kind === 'local' && (
              <p className="text-xs text-gray-500 truncate">{effect.name}</p>
            )}
            {proofFiles.length === 0 ? (
              <p className="text-xs text-gray-400">
                {bi('No design proofs yet — upload an effect image', '尚未有設計圖 — 請上傳效果圖')}
              </p>
            ) : (
              <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {proofFiles.map((f) => {
                  const url = orderFileUrl(f);
                  const selected = effect?.kind === 'file' && effect.file.id === f.id;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => selectExisting(f)}
                        className={`block w-full rounded-lg overflow-hidden border-2 ${
                          selected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200 hover:border-brand-300'
                        }`}
                        title={f.original_name || `Image #${f.id}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="aspect-square w-full object-cover bg-gray-100" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">{bi('Preview', '預覽')}</h2>
          <ProductionNotePreview
            imageSrc={effect?.src || null}
            fields={fields}
            textOffset={textOffset}
            onTextOffsetChange={setTextOffset}
          />
        </div>
      </div>
    </AppLayout>
  );
}
