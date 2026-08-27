'use client';

import { BTN } from '@/lib/ui-labels';

interface Props {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export default function RentalDetailModal({ title, children, onClose }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel max-h-[92vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-700 text-xl"
            aria-label={BTN.close}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
