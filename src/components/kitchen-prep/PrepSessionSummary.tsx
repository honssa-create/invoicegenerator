import { sessionPotBuckets, type PrepCapacitySummaryLine, type SessionPotBucket } from '@/lib/kitchen-prep';

export function potBucketLabel(bucket: SessionPotBucket): string {
  if (bucket.mixed) return `75g+45g mixed pot ${bucket.bottles}/${bucket.limit}`;
  return `${bucket.label} pot ${bucket.bottles}/${bucket.limit}`;
}

export default function PrepSessionSummary({
  title,
  lines,
  buckets,
  variant = 'card',
}: {
  title?: string;
  lines: PrepCapacitySummaryLine[];
  buckets?: SessionPotBucket[];
  /** `strip` sits inside a session card (list). `card` is the standalone summary. */
  variant?: 'card' | 'strip';
}) {
  if (!lines.length) return null;
  const potBuckets = buckets ?? sessionPotBuckets(lines.map((line) => ({ capacity: line.capacity, bottles: line.bottles })));
  const over = potBuckets.some((bucket) => bucket.bottles > bucket.limit);
  const totalBottles = lines.reduce((sum, line) => sum + line.bottles, 0);
  const potText = potBuckets.map((bucket) => {
    const label = potBucketLabel(bucket);
    return bucket.bottles > bucket.limit ? `${label} over limit` : label;
  });

  if (variant === 'strip') {
    return (
      <div
        className={`border-b border-gray-200 px-4 py-2.5 text-[13px] leading-relaxed ${
          over ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-gray-500'
        }`}
      >
        <p>
          <strong className="text-gray-900">呢組產能：</strong>
          {potText.join(' · ')}
          {potText.length > 0 ? ' · ' : ''}
          合計 <strong className="text-gray-900">{totalBottles} 樽</strong>
          {over ? ' · 超鍋' : ' · 未超鍋'}
        </p>
        <ul className="mt-1 space-y-0.5">
          {lines.map((line) => (
            <li key={line.capacity}>
              <span className="font-semibold text-gray-900">{line.label}:</span> {line.text}
              <span> · {line.bottles} 樽</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
            const bucketOver = bucket.bottles > bucket.limit;
            return (
              <span key={bucket.id}>
                {index > 0 ? ' · ' : ''}
                <span className={bucketOver ? 'text-amber-700 font-medium' : undefined}>
                  {potBucketLabel(bucket)}
                  {bucketOver ? ' over limit' : ''}
                </span>
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
