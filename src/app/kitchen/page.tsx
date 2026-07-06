'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  FLAVORS,
  CAPACITIES,
  FINISHED_SKUS,
  OOS_STATUS,
  READY_STATUS,
  computeBatchMaterials,
  type KitchenState,
} from '@/lib/kitchen';

export default function KitchenPage() {
  const [state, setState] = useState<KitchenState | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  // Daily order form
  const [oCustomer, setOCustomer] = useState('');
  const [oSku, setOSku] = useState(FINISHED_SKUS[0]);
  const [oQty, setOQty] = useState(4);

  // Batch form
  const [bFlavor, setBFlavor] = useState<string>(FLAVORS[0]);
  const [bCap, setBCap] = useState<string>(CAPACITIES[0]);
  const [bDate, setBDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [bBottles, setBBottles] = useState(40);

  const load = () => fetch('/api/kitchen/state').then((r) => r.json()).then((d) => setState(d.state));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const flash = (text: string, kind: 'success' | 'error' = 'success') => setToast({ text, kind });

  const createOrder = async () => {
    const res = await fetch('/api/kitchen/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer: oCustomer, sku: oSku, quantity: oQty, source: 'manual' }),
    });
    const data = await res.json();
    if (!res.ok) { flash(data.error || 'Failed', 'error'); return; }
    setState(data.state);
    setOCustomer('');
    flash(data.order.status === READY_STATUS ? `✅ In stock — deducted & Ready to Ship` : `🔴 Out of stock — sent to backlog`, data.order.status === READY_STATUS ? 'success' : 'error');
  };

  const createBatch = async () => {
    const res = await fetch('/api/kitchen/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flavor: bFlavor, capacity: bCap, brewing_date: bDate, bottle_count: bBottles }),
    });
    const data = await res.json();
    if (!res.ok) { flash(data.error || 'Failed', 'error'); return; }
    setState(data.state);
    flash(`Batch scheduled — raw materials allocated`);
  };

  const completeBatch = async (id: number) => {
    const res = await fetch(`/api/kitchen/batches/${id}/complete`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { flash(data.error || 'Failed', 'error'); return; }
    setState(data.state);
    flash(`✅ Brewed +${data.added} to finished stock${data.fulfilled?.length ? `, fulfilled ${data.fulfilled.length} backlog order(s)` : ''}`);
  };

  const badge = (status: string) => {
    if (status === READY_STATUS) return 'bg-green-100 text-green-700';
    if (status === OOS_STATUS) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const input = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  const preview = computeBatchMaterials(Number(bBottles) || 0);
  const backlog = state?.orders.filter((o) => o.status === OOS_STATUS) || [];

  if (!state) {
    return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Kitchen 智能廚房排程</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Order routing → batch brewing → two-tier inventory, all linked</p>
        </div>
      </div>

      {/* Two-tier inventory */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">成品庫存 Finished Goods (fridge)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {state.finished.map((f) => (
              <div key={f.sku} className={`rounded-lg border p-3 ${f.quantity > 0 ? 'border-green-200 bg-green-50/40' : 'border-gray-100 bg-gray-50'}`}>
                <p className="text-xs text-gray-500">{f.sku}</p>
                <p className="text-2xl font-bold text-gray-900">{f.quantity}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">原材料庫存 Raw Materials (Available = Total − Allocated)</h2>
          <div className="table-scroll">
          <table className="w-full text-sm min-w-[320px]">
            <thead><tr className="text-left text-xs text-gray-500 uppercase"><th className="py-1">Material</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Allocated</th><th className="py-1 text-right">Available</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {state.raw.map((r) => (
                <tr key={r.name}>
                  <td className="py-1.5">{r.name} <span className="text-gray-400">({r.unit})</span></td>
                  <td className="py-1.5 text-right">{r.total_stock}</td>
                  <td className="py-1.5 text-right text-amber-600">{r.allocated_stock}</td>
                  <td className={`py-1.5 text-right font-semibold ${r.available < 0 ? 'text-red-600' : 'text-gray-900'}`}>{r.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Daily orders */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">日常客訂單 Daily Orders</h2>
          {backlog.length > 0 && <span className="text-xs font-medium bg-red-100 text-red-700 rounded-full px-3 py-1">🔴 Backlog: {backlog.length}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-gray-50 rounded-lg">
          <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">Customer</label><input value={oCustomer} onChange={(e) => setOCustomer(e.target.value)} placeholder="WooCommerce customer" className={input} /></div>
          <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">Product (SKU)</label><select value={oSku} onChange={(e) => setOSku(e.target.value)} className={input}>{FINISHED_SKUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">Qty (樽)</label><input type="number" min={1} value={oQty} onChange={(e) => setOQty(Number(e.target.value))} className={`${input} w-24`} /></div>
          <button onClick={createOrder} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">Place Order (auto-route)</button>
        </div>
        {state.orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet. Place one to see the stock-check routing.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200"><th className="py-2">Customer</th><th className="py-2">SKU</th><th className="py-2">Qty</th><th className="py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {state.orders.map((o) => (
                <tr key={o.id} className={o.status === OOS_STATUS ? 'bg-red-50/40' : ''}>
                  <td className="py-2">{o.customer || '—'}</td>
                  <td className="py-2">{o.sku}</td>
                  <td className="py-2">{o.quantity}</td>
                  <td className="py-2"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badge(o.status)}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Brewing */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">大煲燉煮 Batch Brewing Console</h2>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">Flavor 口味</label><select value={bFlavor} onChange={(e) => setBFlavor(e.target.value)} className={input}>{FLAVORS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
              <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">Capacity 容量</label><select value={bCap} onChange={(e) => setBCap(e.target.value)} className={input}>{CAPACITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">生產日期 Brewing Date</label><input type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} className={input} /></div>
              <div className="flex flex-col"><label className="text-[11px] text-gray-500 mb-1">大煲總樽數 Batch bottles</label><input type="number" min={1} value={bBottles} onChange={(e) => setBBottles(Number(e.target.value))} className={input} /></div>
            </div>
            <button onClick={createBatch} className="w-full py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">建立燉煮批次 Create Batch (allocate raw)</button>
          </div>

          {/* 大字報 live preview */}
          <div className="p-4 rounded-lg border-2 border-gray-900">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">大字報 · {bBottles || 0} 樽 {bCap} {bFlavor}</p>
            <div className="grid grid-cols-2 gap-2">
              {preview.map((m) => (
                <div key={m.name} className="flex items-baseline justify-between border-b border-gray-100 py-1">
                  <span className="text-sm text-gray-600">{m.name}</span>
                  <span className="text-xl font-bold text-gray-900">{m.qty}<span className="text-xs font-normal text-gray-400 ml-1">{m.unit}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {state.batches.length === 0 ? (
            <p className="text-sm text-gray-400">No batches yet.</p>
          ) : state.batches.map((b) => (
            <div key={b.id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-medium text-gray-900">{b.bottle_count} 樽 · {b.capacity} {b.flavor} <span className="text-xs text-gray-400">· {b.brewing_date || '—'}</span></p>
                <p className="text-xs text-gray-500 mt-0.5">{b.materials.map((m) => `${m.name} ${m.qty}${m.unit}`).join(' · ')}</p>
              </div>
              {b.status === 'completed' ? (
                <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">✅ Completed</span>
              ) : (
                <button onClick={() => completeBatch(b.id)} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">完成燉製 Complete Brewing</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{toast.text}</div>
      )}
    </AppLayout>
  );
}
