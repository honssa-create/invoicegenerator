import Link from 'next/link';
import type { LedgerSource } from '@/lib/types';

interface LedgerSourceCellProps {
  source: LedgerSource;
  prominent?: boolean;
}

export function LedgerSourceCell({ source, prominent = true }: LedgerSourceCellProps) {
  if (source.type === 'unlinked') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200 ${
          prominent ? 'text-sm' : ''
        }`}
      >
        <span>{source.icon}</span>
        <span>{source.label}</span>
      </span>
    );
  }

  if (source.type === 'other_income') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium text-gray-800 ${
          prominent ? 'text-sm' : 'text-xs'
        }`}
      >
        <span className="text-base">{source.icon}</span>
        <span>{source.label}</span>
      </span>
    );
  }

  if (source.type === 'order' || source.type === 'linked_order') {
    const content = (
      <>
        <span className="text-base">{source.icon}</span>
        <span>
          Order #{source.orderNumber}
          {source.customerName && (
            <span className="text-gray-500"> ({source.customerName})</span>
          )}
        </span>
      </>
    );

    if (source.href) {
      return (
        <Link
          href={source.href}
          className={`inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-800 hover:underline ${
            prominent ? 'text-sm' : 'text-xs'
          }`}
        >
          {content}
        </Link>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium text-gray-800 ${
          prominent ? 'text-sm' : 'text-xs'
        }`}
      >
        {content}
      </span>
    );
  }

  return <span className="text-sm text-gray-500">{source.label}</span>;
}
