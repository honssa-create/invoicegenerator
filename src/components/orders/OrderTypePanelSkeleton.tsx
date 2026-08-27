export default function OrderTypePanelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      <div className="h-5 w-40 bg-gray-100 rounded" />
      <div className="h-32 bg-gray-50 rounded-xl border border-gray-100" />
      <div className="h-24 bg-gray-50 rounded-xl border border-gray-100" />
    </div>
  );
}
