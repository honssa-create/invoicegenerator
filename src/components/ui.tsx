import { formatCurrency, STATUS_COLORS } from '@/lib/utils';
import type { InvoiceStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: InvoiceStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color?: string;
}

export function StatCard({ title, value, subtitle, icon, color = 'bg-brand-50 text-brand-600' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export { formatCurrency };
