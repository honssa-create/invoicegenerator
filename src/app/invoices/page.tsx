import { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import InvoicesList from './InvoicesList';

export default function InvoicesPage() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-100 rounded-lg" />
            <div className="h-64 bg-gray-100 rounded-xl" />
          </div>
        }
      >
        <InvoicesList />
      </Suspense>
    </AppLayout>
  );
}
