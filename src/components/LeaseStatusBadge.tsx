'use client';

import { LEASE_STATUS_BADGE, LEASE_STATUS_LABELS, type LeaseDisplayStatus } from '@/lib/rentals';

interface Props {
  status: LeaseDisplayStatus;
  className?: string;
}

export default function LeaseStatusBadge({ status, className = '' }: Props) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${LEASE_STATUS_BADGE[status]} ${className}`}>
      {LEASE_STATUS_LABELS[status]}
    </span>
  );
}
