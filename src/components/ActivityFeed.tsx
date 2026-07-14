'use client';

import { useEffect, useState } from 'react';
import { KITCHEN_COMPLETION_ACTIVITY_PREFIX } from '@/lib/kitchen-prep';

interface Activity {
  id: number;
  kind: 'comment' | 'activity';
  author: string | null;
  body: string;
  created_at: string;
}

interface ActivityFeedProps {
  entityType: 'order' | 'invoice' | 'quotation';
  entityId: number | string;
  className?: string;
}

export default function ActivityFeed({ entityType, entityId, className = '' }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  const load = () => {
    fetch(`/api/activities?type=${entityType}&id=${entityId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setActivities(d.activities || []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const post = async () => {
    const text = comment.trim();
    if (!text) return;
    setPosting(true);
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: entityType, id: entityId, body: text }),
    });
    setPosting(false);
    if (res.ok) {
      const data = await res.json();
      setActivities(data.activities || []);
      setComment('');
    }
  };

  const isSystem = (a: Activity) => a.kind === 'activity' && (a.author === 'System' || a.body.startsWith('['));

  const renderActivityBody = (body: string) => {
    if (!body.startsWith(KITCHEN_COMPLETION_ACTIVITY_PREFIX)) {
      return <span>{body}</span>;
    }
    const match = body.match(/Expected:\s*(\d+),\s*Actual:\s*(\d+)/);
    if (!match) return <span>{body}</span>;
    const expected = Number(match[1]);
    const actual = Number(match[2]);
    const hasVariance = expected !== actual;
    const before = body.slice(0, match.index);
    const after = body.slice((match.index ?? 0) + match[0].length);
    return (
      <span>
        {before}
        <span className={hasVariance ? 'text-red-600 font-semibold' : ''}>
          Expected: {expected}, Actual: {actual}
        </span>
        {after}
      </span>
    );
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Activity</h2>
        <span className="text-xs text-gray-400">{activities.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No activity yet. Start the conversation below.</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="flex gap-2">
              <div className={`h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 ${isSystem(a) ? 'bg-gray-200 text-gray-600' : 'bg-brand-100 text-brand-700'}`}>
                {isSystem(a) ? '⚙' : (a.author || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                {a.kind === 'activity' ? (
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{a.author}</span>{' '}
                    {renderActivityBody(a.body)}
                    <span className="text-gray-300"> · {a.created_at?.slice(5, 16)}</span>
                  </p>
                ) : (
                  <div>
                    <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">{a.author}</span><span className="text-gray-300"> · {a.created_at?.slice(5, 16)}</span></p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-0.5">{a.body}</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-200 p-3">
        <div className="border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-brand-500">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }}
            rows={2}
            placeholder="Write a comment…"
            className="w-full px-3 py-2 text-sm outline-none resize-none rounded-t-lg"
          />
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-gray-100">
            <div className="flex items-center gap-1 text-gray-400">
              <button type="button" title="Attach" className="hover:text-gray-600 px-1">📎</button>
              <button type="button" title="Mention" className="hover:text-gray-600 px-1">@</button>
              <button type="button" title="Emoji" className="hover:text-gray-600 px-1">😊</button>
              <button type="button" title="Image" className="hover:text-gray-600 px-1">🖼️</button>
            </div>
            <button onClick={post} disabled={posting || !comment.trim()} className="px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {posting ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
