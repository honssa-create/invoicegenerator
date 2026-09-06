'use client';

import { useState } from 'react';
import { BTN, bi } from '@/lib/ui-labels';
import { RENTAL_DETAIL_INPUT_CLS } from '@/lib/rental-unit-detail-shared';
import RentalDetailModal from '@/components/rentals/RentalDetailModal';

interface Props {
  open: boolean;
  unitId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function RentalNoteModal({ open, unitId, onClose, onSaved }: Props) {
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setNoteText('');
    onClose();
  };

  const save = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    await fetch(`/api/rentals/units/${unitId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'Note Added', note: noteText }),
    });
    setBusy(false);
    setNoteText('');
    onClose();
    onSaved();
  };

  return (
    <RentalDetailModal title={bi('Log Activity Note', '記錄活動備註')} onClose={handleClose}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{bi('Activity note', '活動備註')}</label>
      <textarea
        className={RENTAL_DETAIL_INPUT_CLS}
        rows={4}
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="e.g. Tenant called about late payment…"
      />
      <div className="flex justify-end gap-3 mt-4">
        <button onClick={handleClose} className="px-4 py-2 border rounded-lg text-sm">
          {BTN.cancel}
        </button>
        <button
          onClick={() => void save()}
          disabled={busy}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {BTN.save} {bi('Note', '備註')}
        </button>
      </div>
    </RentalDetailModal>
  );
}
