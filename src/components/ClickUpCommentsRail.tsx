'use client';

import { useMemo, useState } from 'react';
import { KITCHEN_COMPLETION_ACTIVITY_PREFIX } from '@/lib/kitchen-prep';
import {
  activityOneLiner,
  commentAvatarColor,
  commentInitials,
  commentParts,
  formatFeedClock,
  groupFeedByDay,
  localDateYmd,
  type CommentPart,
} from '@/lib/activity-feed-display';

export interface RailActivity {
  id: number;
  kind: 'comment' | 'activity';
  author: string | null;
  body: string;
  created_at: string;
}

type Props = {
  className?: string;
  heading?: string;
  subtitle?: string;
  activities: RailActivity[];
  comment: string;
  posting: boolean;
  onCommentChange: (value: string) => void;
  onPost: () => void;
};

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5L20 20.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 12L20 4l-6.5 16-2.2-6.3L4 12z" strokeLinejoin="round" />
      <path d="M11.3 13.7L20 4" strokeLinecap="round" />
    </svg>
  );
}

function ActivitySentence({ author, body }: { author: string | null; body: string }) {
  const sentence = activityOneLiner(author, body);
  if (!body.startsWith(KITCHEN_COMPLETION_ACTIVITY_PREFIX)) return <span>{sentence}</span>;
  const match = sentence.match(/Expected:\s*(\d+),\s*Actual:\s*(\d+)/);
  if (!match || match.index == null) return <span>{sentence}</span>;
  const expected = Number(match[1]);
  const actual = Number(match[2]);
  return (
    <span>
      {sentence.slice(0, match.index)}
      <span className={expected !== actual ? 'font-semibold text-red-600' : ''}>
        Expected: {expected}, Actual: {actual}
      </span>
      {sentence.slice(match.index + match[0].length)}
    </span>
  );
}

function CommentBody({ body }: { body: string }) {
  const parts = commentParts(body);
  if (!parts.length) return null;
  return (
    <div className="mt-1 space-y-2">
      {parts.map((part, index) => (
        <CommentPartView key={index} part={part} />
      ))}
    </div>
  );
}

function CommentPartView({ part }: { part: CommentPart }) {
  if (part.kind === 'text') {
    return <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#292d34]">{part.text}</p>;
  }
  return (
    <a
      href={part.href}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-lg border border-[#e4e6ea] bg-[#fafafa] no-underline"
    >
      {part.label ? <div className="px-2.5 py-1 text-[11px] text-[#7c828d]">{part.label}</div> : null}
      <div className="break-all bg-white px-3 py-2.5 text-[13px] font-semibold text-[#5b67ca]">{part.display}</div>
    </a>
  );
}

export default function ClickUpCommentsRail({
  className = '',
  heading = 'Comments',
  subtitle,
  activities,
  comment,
  posting,
  onCommentChange,
  onPost,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const today = localDateYmd();
  const q = query.trim().toLowerCase();
  const commentCount = activities.filter((item) => item.kind === 'comment').length;

  const visible = useMemo(() => {
    if (!q) return activities;
    return activities.filter((item) => {
      const blob = item.kind === 'comment'
        ? `${item.author || ''}\n${item.body}`
        : activityOneLiner(item.author, item.body);
      return blob.toLowerCase().includes(q);
    });
  }, [activities, q]);

  const groups = groupFeedByDay(visible, today);

  const insertToken = (token: string) => {
    onCommentChange(comment ? `${comment}${comment.endsWith(' ') ? '' : ' '}${token}` : token);
  };

  return (
    <div className={`flex h-full min-h-0 flex-col bg-white ${className}`}>
      <div className="border-b border-[#eceef1] px-4 pb-2 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="text-[15px] font-bold text-[#292d34]">{heading}</h2>
            {subtitle ? <span className="truncate text-xs font-normal text-[#7c828d]">{subtitle}</span> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[#7c828d]">
            <button
              type="button"
              aria-label="Search comments"
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
              className="rounded p-1 hover:bg-[#f3f4f6] hover:text-[#292d34]"
            >
              <IconSearch />
            </button>
            <span className="min-w-[1ch] text-right text-[13px] tabular-nums">{commentCount}</span>
          </div>
        </div>
        {searchOpen ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search comments"
            className="mt-2 w-full rounded-md border border-[#e4e6ea] px-2 py-1 text-[13px] outline-none focus:border-[#c5cad3]"
          />
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[#87909e]">
            {q ? 'No matching comments.' : 'No comments yet.'}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key}>
              {group.label ? (
                <div className="py-2 text-center text-xs text-[#7c828d]">{group.label}</div>
              ) : null}
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const clock = formatFeedClock(item.created_at);
                  if (item.kind !== 'comment') {
                    return (
                      <div key={item.id} className="flex items-start gap-3 pl-10 text-[12.5px] leading-snug text-[#7c828d]">
                        <p className="min-w-0 flex-1">
                          <ActivitySentence author={item.author} body={item.body} />
                        </p>
                        {clock ? <time className="shrink-0 text-[#87909e]">{clock}</time> : null}
                      </div>
                    );
                  }
                  const name = item.author || 'Comment';
                  return (
                    <article key={item.id} className="flex gap-2.5 py-2">
                      <span
                        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: commentAvatarColor(name) }}
                      >
                        {commentInitials(name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] leading-5">
                          <span className="font-bold text-[#292d34]">{name}</span>
                          {clock ? <span className="ml-1.5 text-xs font-normal text-[#87909e]">{clock}</span> : null}
                        </div>
                        <CommentBody body={item.body} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="border-t border-[#eceef1] px-3 py-3">
        <div className="rounded-[10px] border border-[#e4e6ea]">
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onPost();
              }
            }}
            rows={2}
            placeholder="Write a comment"
            className="w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13px] text-[#292d34] outline-none placeholder:text-[#87909e]"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center text-[#9aa3ad]">
              <button type="button" title="Attach" className="rounded px-1.5 py-1 hover:bg-[#f3f4f6] hover:text-[#5c6370]">📎</button>
              <button type="button" title="Mention" onClick={() => insertToken('@')} className="rounded px-1.5 py-1 text-sm hover:bg-[#f3f4f6] hover:text-[#5c6370]">@</button>
              <button type="button" title="Emoji" className="rounded px-1.5 py-1 hover:bg-[#f3f4f6]">😊</button>
            </div>
            <button
              type="button"
              aria-label="Send comment"
              onClick={onPost}
              disabled={posting || !comment.trim()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#7c828d] hover:bg-[#f3f4f6] hover:text-[#292d34] disabled:opacity-30"
            >
              <IconSend />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
