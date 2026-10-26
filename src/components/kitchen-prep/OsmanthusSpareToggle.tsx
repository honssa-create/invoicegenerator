'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PREP_DAY_OSMANTHUS_SPARE_FACTOR,
  readPrepDayOsmanthusSpareEnabled,
  writePrepDayOsmanthusSpareEnabled,
} from '@/lib/kitchen-prep';
import { bi } from '@/lib/ui-labels';

export function usePrepDayOsmanthusSpare() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readPrepDayOsmanthusSpareEnabled());
  }, []);

  const setSpareEnabled = useCallback((next: boolean) => {
    setEnabled(next);
    writePrepDayOsmanthusSpareEnabled(next);
  }, []);

  return {
    enabled,
    setSpareEnabled,
    factor: enabled ? PREP_DAY_OSMANTHUS_SPARE_FACTOR : 1,
  };
}

type OsmanthusSpareToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
  compact?: boolean;
};

export function OsmanthusSpareToggle({ enabled, onChange, className = '', compact }: OsmanthusSpareToggleProps) {
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-sm font-semibold text-[#92400e] ${className}`}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[#d97706] text-[#b45309] focus:ring-[#f59e0b]"
      />
      <span>
        桂花預留 ×{PREP_DAY_OSMANTHUS_SPARE_FACTOR}
        {!compact && (
          <span className="ml-1 font-normal text-[#a16207]">
            {bi('(day sheet yellow boxes)', '（全日材料黃框）')}
          </span>
        )}
      </span>
    </label>
  );
}
