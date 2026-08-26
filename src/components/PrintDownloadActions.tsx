'use client';

import { useState } from 'react';
import { downloadElementAsA4Pdf } from '@/lib/download-print-pdf';
import { BTN, bi } from '@/lib/ui-labels';

export default function PrintDownloadActions({
  filename,
  captureSelector = '.quo-preview-page',
}: {
  filename: string;
  captureSelector?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const print = () => {
    const prev = document.title;
    document.title = filename;
    window.print();
    window.setTimeout(() => {
      document.title = prev;
    }, 500);
  };

  const download = async () => {
    const el = document.querySelector(captureSelector);
    if (!(el instanceof HTMLElement)) {
      setError(bi('Could not download PDF', '無法下載 PDF'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await downloadElementAsA4Pdf(el, filename);
    } catch {
      setError(bi('Could not download PDF', '無法下載 PDF'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={print}
        className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
      >
        {BTN.print}
      </button>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? BTN.downloadingPdf : BTN.downloadPdf}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
