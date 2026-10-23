import { sessionPotBuckets, type PrepCapacitySummaryLine, type SessionPotBucket } from '@/lib/kitchen-prep';

export function potBucketLabel(bucket: SessionPotBucket): string {
  if (bucket.mixed) return `75g+45g mixed pot ${bucket.bottles}/${bucket.limit}`;
  return `${bucket.label} pot ${bucket.bottles}/${bucket.limit}`;
}

export default function PrepSessionSummary({
  title,
  lines,
  buckets,
}: {
  title?: string;
  lines: PrepCapacitySummaryLine[];
  buckets?: SessionPotBucket[];
}) {
  if (!lines.length) return null;
  const potBuckets = buckets ?? sessionPotBuckets(lines.map((line) => ({ capacity: line.capacity, bottles: line.bottles })));
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm">
      {title && <p className="font-semibold text-gray-800 mb-1">{title}</p>}
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line.capacity} className="text-gray-800">
            <span className="font-semibold">{line.label}:</span> {line.text}
            <span className="text-gray-500"> · {line.bottles} 樽</span>
          </li>
        ))}
      </ul>
      {potBuckets.length > 0 && (
        <p className="mt-2 text-xs text-gray-600">
          {potBuckets.map((bucket, index) => {
            const over = bucket.bottles > bucket.limit;
            return (
              <span key={bucket.id}>
                {index > 0 ? ' · ' : ''}
                <span className={over ? 'text-amber-700 font-medium' : undefined}>
                  {potBucketLabel(bucket)}
                  {over ? ' over limit' : ''}
                </span>
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
