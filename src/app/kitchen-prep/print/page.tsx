import { Suspense } from 'react';
import KitchenPrepGroupPrint from './PrintView';

export default function KitchenPrepGroupPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      }
    >
      <KitchenPrepGroupPrint />
    </Suspense>
  );
}
