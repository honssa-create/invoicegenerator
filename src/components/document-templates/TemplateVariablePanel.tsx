'use client';

import { DEBIT_NOTE_TEMPLATE_VARIABLES } from '@/lib/document-templates';

interface Props {
  onInsert: (token: string) => void;
}

export default function TemplateVariablePanel({ onInsert }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3">
      <p className="text-xs font-medium text-gray-600 mb-2">
        Dynamic variables 動態變數 — click to insert at cursor
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DEBIT_NOTE_TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            title={`${v.label} · sample: ${v.sample || '(empty)'}`}
            onClick={() => onInsert(`{{${v.key}}}`)}
            className="px-2 py-1 text-xs font-mono rounded-md bg-white border border-gray-200 text-gray-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
          >
            {`{{${v.key}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}
