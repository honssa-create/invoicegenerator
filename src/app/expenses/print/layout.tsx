import type { ReactNode } from 'react';

/** Standalone print layout — no AppLayout sidebar. */
export default function ExpensePrintLayout({ children }: { children: ReactNode }) {
  return <div className="expense-print-root min-h-screen bg-gray-100 print:bg-white">{children}</div>;
}
