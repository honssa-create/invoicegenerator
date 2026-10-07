'use client';

import AppLayout from '@/components/AppLayout';
import PartTimeSalaryManager from '@/components/part-time/PartTimeSalaryManager';
import { useAuth } from '@/components/AuthProvider';

export default function PartTimePage() {
  const { isSectionReadOnly } = useAuth();
  return (
    <AppLayout>
      <PartTimeSalaryManager readOnly={isSectionReadOnly('part_time')} />
    </AppLayout>
  );
}
