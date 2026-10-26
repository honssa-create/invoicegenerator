import { Suspense } from 'react';
import KitchenPrepDayPrint from './DayPrintView';

export default function KitchenPrepDayPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      }
    >
      <KitchenPrepDayPrint />
    </Suspense>
  );
}
