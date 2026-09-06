'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import BirdNestProductionSchedule from '@/components/demand-forecast/BirdNestProductionSchedule';
import ShippingBoxesForecast from '@/components/demand-forecast/ShippingBoxesForecast';
import { DateFilterTypeToggle } from '@/components/demand-forecast/forecast-ui';
import {
  localDateYmd,
  monthStartYmd,
  type DemandForecastDateFilterType,
} from '@/lib/demand-forecast';

function bi(en: string, zh: string): string {
  return `${en} / ${zh}`;
}

const fieldCls =
  'w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#C8B07A] outline-none';

export default function DemandForecastPage() {
  const [dateStart, setDateStart] = useState(monthStartYmd);
  const [dateEnd, setDateEnd] = useState(localDateYmd);
  const [dateFilterType, setDateFilterType] = useState<DemandForecastDateFilterType>('order_date');

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{bi('Demand Forecast', '備貨預測')}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi(
              'Consolidated forecast for packaging materials and kitchen production capacity.',
              '統整包裝物料與廚房產能的未來需求預測',
            )}
          </p>
        </div>
      </div>

      {/* Global date filter */}
      <div className="mb-6 rounded-2xl border border-[#C8B07A]/50 bg-[#F7F2E8]/60 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          {bi('Section date filter', '區段日期篩選')}
        </h2>
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-4">
          <div className="grid grid-cols-2 gap-3 sm:max-w-md flex-1">
            <div className="flex flex-col min-w-0">
              <label className="text-[11px] font-medium text-gray-500 mb-1">
                {bi('Start date', '開始日期')}
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div className="flex flex-col min-w-0">
              <label className="text-[11px] font-medium text-gray-500 mb-1">
                {bi('End date', '結束日期')}
              </label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>

          <DateFilterTypeToggle value={dateFilterType} onChange={setDateFilterType} />

          <button
            type="button"
            onClick={() => {
              setDateStart('');
              setDateEnd('');
            }}
            className="min-h-[44px] px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-white/80 self-start"
          >
            {bi('Clear dates', '清除日期')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BirdNestProductionSchedule
          dateStart={dateStart}
          dateEnd={dateEnd}
          dateFilterType={dateFilterType}
        />
        <ShippingBoxesForecast
          dateStart={dateStart}
          dateEnd={dateEnd}
          dateFilterType={dateFilterType}
        />
      </div>
    </AppLayout>
  );
}
