'use client';

import { useEffect, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import { TITLE, bi } from '@/lib/ui-labels';
import AdminHistoryView from './AdminHistoryView';
import KioskClockInView from './KioskClockInView';
import StaffManagerModal from './StaffManagerModal';
import { usePartTimeRecords } from './usePartTimeRecords';

type View = 'kiosk' | 'admin';

export default function PartTimeSalaryManager({ readOnly }: { readOnly: boolean }) {
  const model = usePartTimeRecords();
  const [view, setView] = useState<View>('kiosk');
  const [staffOpen, setStaffOpen] = useState(false);

  useEffect(() => {
    model.bootStaff();
    // Boot once. Later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (model.busyId || model.staffBusy) return;
      model.refreshStaff().catch(() => undefined);
    };
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [model.busyId, model.staffBusy, model.refreshStaff]);

  const openStaff = () => {
    model.clearError();
    setStaffOpen(true);
    model.loadDirectory();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.partTime}</h1>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            {bi('iPad clock-in with signature and salary. History stays on the server for payroll.', 'iPad 打卡、簽名及計薪。紀錄存在伺服器，方便出糧。')}
          </p>
        </div>
        <button
          type="button"
          className="min-h-12 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800"
          {...tapProps(openStaff)}
        >
          員工 / Staff
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
        <button
          type="button"
          aria-pressed={view === 'kiosk'}
          className={`min-h-12 rounded-xl text-sm font-semibold ${view === 'kiosk' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
          {...tapProps(() => setView('kiosk'))}
        >
          打卡 / Kiosk
        </button>
        <button
          type="button"
          aria-pressed={view === 'admin'}
          className={`min-h-12 rounded-xl text-sm font-semibold ${view === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
          {...tapProps(() => setView('admin'))}
        >
          紀錄 / History
        </button>
      </div>

      {view === 'kiosk' ? (
        <KioskClockInView
          staff={model.staff}
          loading={model.staffLoading}
          readOnly={readOnly}
          busyId={model.busyId}
          error={model.error}
          onClockIn={model.clockIn}
          onClockOut={model.clockOut}
        />
      ) : (
        <AdminHistoryView
          directory={model.directory}
          records={model.records}
          summary={model.summary}
          loading={model.recordsLoading}
          truncated={model.truncated}
          readOnly={readOnly}
          deletingId={model.deletingId}
          exporting={model.exporting}
          error={model.error}
          loadDirectory={model.loadDirectory}
          loadRecords={model.loadRecords}
          onDelete={model.removeRecord}
          onExport={model.exportCsv}
        />
      )}

      {staffOpen && (
        <StaffManagerModal
          staff={model.directory}
          loading={model.directoryLoading && model.directory.length === 0}
          readOnly={readOnly}
          busy={model.staffBusy}
          error={model.error}
          onClose={() => setStaffOpen(false)}
          onCreate={model.createStaff}
          onUpdate={model.updateStaff}
        />
      )}
    </div>
  );
}
