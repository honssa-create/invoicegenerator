'use client';

import type { ReactNode } from 'react';

interface Props {
  editor: ReactNode;
  preview: ReactNode;
}

/** Split-screen shell: editor left, live preview right. */
export default function DocumentTemplateShell({ editor, preview }: Props) {
  return (
    <div className="flex flex-col lg:flex-row border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm min-h-[calc(100vh-12rem)]">
      <aside className="lg:w-[44%] xl:w-[40%] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col max-h-[50vh] lg:max-h-[calc(100vh-12rem)]">
        <div className="shrink-0 px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Template Editor 範本編輯</h2>
          <p className="text-xs text-gray-500 mt-0.5">Changes update the preview instantly · 即時預覽</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">{editor}</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col bg-gray-100 max-h-[calc(100vh-12rem)] lg:max-h-[calc(100vh-12rem)]">
        <div className="shrink-0 px-4 py-3 bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
          <h2 className="text-sm font-semibold text-gray-900">Live Preview 即時預覽</h2>
          <p className="text-xs text-gray-500 mt-0.5">Sample data · 示範資料</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-8">{preview}</div>
      </div>
    </div>
  );
}
