'use client';

import { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { compressImage } from '@/lib/imageCompression';
import type { InboundShipment } from '@/lib/inbound';

const today = () => new Date().toISOString().slice(0, 10);

export default function InboundPage() {
  const [shipments, setShipments] = useState<InboundShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [waybill, setWaybill] = useState('');
  const [sender, setSender] = useState('');
  const [arrival, setArrival] = useState(today());
  const [photoPath, setPhotoPath] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/inbound').then((r) => r.json()).then((d) => setShipments(d.shipments || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setWaybill(''); setSender(''); setArrival(today()); setPhotoPath(''); setPreview(null); setScanMsg('');
  };

  const handlePhoto = async (rawFile: File) => {
    setScanning(true);
    setScanMsg('Compressing image…');

    // Compress on the client (max 1200px, target < 300KB, clean JPEG) before upload.
    let file = rawFile;
    let compressNote = '';
    try {
      const c = await compressImage(rawFile, { maxDim: 1200, targetBytes: 300 * 1024, mimeType: 'image/jpeg' });
      file = c.file;
      const kb = (n: number) => `${Math.round(n / 1024)}KB`;
      compressNote = c.compressed ? `Compressed ${kb(c.originalBytes)} → ${kb(c.outputBytes)}. ` : `Photo ${kb(c.outputBytes)}. `;
    } catch {
      // fall back to the original file if compression fails
    }

    setScanMsg(`${compressNote}Scanning shipping label…`);
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res = await fetch('/api/inbound/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setScanMsg(''); setToast(data.error || 'Scan failed'); return; }
      const r = data.result;
      setPhotoPath(r.photo_path || '');
      if (r.waybill_number) setWaybill(r.waybill_number);
      if (r.sender) setSender(r.sender);
      const via = r.source === 'ai' ? 'AI vision (Gemini)' : 'on-device OCR';
      const found = [r.waybill_number && 'waybill', r.sender && 'sender'].filter(Boolean);
      setScanMsg(`${compressNote}${found.length ? `Extracted via ${via}: ${found.join(', ')}. Review & edit if needed.` : `No fields auto-extracted (${via}). Enter manually.`}`);
    } catch {
      setScanMsg(''); setToast('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); e.target.value = ''; };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handlePhoto(f); };

  const save = async () => {
    if (!waybill.trim() && !photoPath) { setToast('Enter a waybill number or attach a photo'); setTimeout(() => setToast(''), 4000); return; }
    setSaving(true);
    const res = await fetch('/api/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waybill_number: waybill, sender, arrival_date: arrival, photo_path: photoPath }),
    });
    setSaving(false);
    if (res.ok) { setToast('Shipment saved!'); setTimeout(() => setToast(''), 3000); resetForm(); load(); }
    else { const d = await res.json(); setToast(d.error || 'Save failed'); setTimeout(() => setToast(''), 4000); }
  };

  const del = async (id: number) => {
    if (!confirm('Delete this shipment record?')) return;
    const res = await fetch(`/api/inbound/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm';

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Inbound Shipments 到件紀錄</h1>
        <p className="text-gray-500 mt-1">Snap a courier label — AI reads the waybill number &amp; sender, then confirm &amp; save</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Upload / preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Shipping Label 貨物相片</h2>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Shipping label" onClick={(e) => { e.stopPropagation(); setLightbox(preview); }} className="max-h-56 mx-auto rounded-lg mb-2 cursor-zoom-in" />
            ) : (
              <div className="text-4xl mb-2">📦📸</div>
            )}
            <p className="text-sm font-medium text-gray-700">{scanning ? 'Scanning…' : 'Click or drop a courier label photo'}</p>
            <p className="text-xs text-gray-400 mt-1">SF Express / logistics waybill · AI vision (Gemini) with OCR fallback</p>
            {scanMsg && <p className="text-xs text-brand-700 mt-2">{scanMsg}</p>}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Shipment Details</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Waybill Number 運單號</label>
              <input value={waybill} onChange={(e) => setWaybill(e.target.value)} className={inputCls} placeholder="e.g. SF5120793357800" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sender 寄件人</label>
              <input value={sender} onChange={(e) => setSender(e.target.value)} className={inputCls} placeholder="Sender name / company" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arrival Date 到貨日</label>
              <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} className={inputCls} />
            </div>
            <button onClick={save} disabled={saving} className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Shipment'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200"><h2 className="font-semibold text-gray-900">Recorded Shipments</h2></div>
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : shipments.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No inbound shipments recorded yet.</div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-3">Photo</th>
                <th className="px-6 py-3">Waybill 運單號</th>
                <th className="px-6 py-3">Sender 寄件人</th>
                <th className="px-6 py-3">Arrival 到貨日</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shipments.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    {s.photo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/inbound-files/${s.id}`} alt="label" onClick={() => setLightbox(`/api/inbound-files/${s.id}`)} className="h-12 w-12 object-cover rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-3 text-sm font-mono text-gray-800">{s.waybill_number || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{s.sender || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-500">{s.arrival_date || '—'}</td>
                  <td className="px-6 py-3 text-sm"><button onClick={() => del(s.id)} className="text-red-600 hover:text-red-700 font-medium">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Shipping label" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-green-600 text-white">{toast}</div>
      )}
    </AppLayout>
  );
}
