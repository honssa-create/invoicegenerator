'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import AppLayout from '@/components/AppLayout';

export default function ScanTablePage() {
  const [grid, setGrid] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    setMessage('');
    setSource('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/scan-table', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to parse the file');
        return;
      }
      const table: string[][] = data.table || [];
      setGrid(table.length ? table : [['', ''], ['', '']]);
      setSource(data.source || '');
      setMessage(
        data.message ||
          (table.length
            ? `Extracted ${table.length} row(s) via ${data.source === 'ai' ? 'AI vision' : 'OCR'}. Click any cell to edit.`
            : 'No rows detected — add rows manually below.')
      );
    } catch {
      setError('Failed to parse the file');
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);

  const setCell = (r: number, c: number, value: string) => {
    setGrid((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)));
  };

  const addRow = () => setGrid((prev) => [...prev, Array(Math.max(cols, 1)).fill('')]);
  const addColumn = () => setGrid((prev) => prev.map((row) => [...row, '']));
  const deleteRow = (r: number) => setGrid((prev) => prev.filter((_, ri) => ri !== r));

  const buildWorkbook = () => {
    const ws = XLSX.utils.aoa_to_sheet(grid);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return wb;
  };

  const exportXlsx = () => XLSX.writeFile(buildWorkbook(), 'scan-table.xlsx', { bookType: 'xlsx' });
  const exportCsv = () => XLSX.writeFile(buildWorkbook(), 'scan-table.csv', { bookType: 'csv' });

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Scan to Table 掃描成表格</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Upload an image or PDF of a printed table, then edit &amp; export it</p>
        </div>
        {grid.length > 0 && (
          <div className="page-actions">
            <button onClick={exportCsv} className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
              ⬇ Export CSV
            </button>
            <button onClick={exportXlsx} className="btn bg-brand-600 text-white hover:bg-brand-700">
              ⬇ Export Excel
            </button>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="mb-6 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
      >
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={onFileChange} />
        <div className="text-4xl mb-2">🧾➡️📊</div>
        <p className="text-sm font-medium text-gray-700">
          {loading ? 'Parsing…' : 'Click or drop a table image (.jpg, .png) or .pdf'}
        </p>
        <p className="text-xs text-gray-400 mt-1">AI vision (Gemini) when configured, otherwise on-device OCR</p>
        {message && <p className="text-xs text-brand-700 mt-2">{message}</p>}
        {source && <p className="text-xs text-gray-400 mt-1">Source: {source === 'ai' ? 'Gemini AI vision' : source === 'ocr' ? 'On-device OCR' : source}</p>}
      </div>

      {grid.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-2 mb-3">
            <button onClick={addRow} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">+ Row</button>
            <button onClick={addColumn} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">+ Column</button>
          </div>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r}>
                    <td className="pr-2 align-middle">
                      <button onClick={() => deleteRow(r)} className="text-red-500 hover:text-red-700 text-xs" aria-label="Delete row">✕</button>
                    </td>
                    {Array.from({ length: cols }).map((_, c) => (
                      <td key={c} className="border border-gray-200 p-0">
                        <input
                          value={row[c] ?? ''}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          className={`px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 min-w-[8rem] ${r === 0 ? 'font-semibold bg-gray-50' : ''}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
