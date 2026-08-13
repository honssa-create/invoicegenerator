'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { STATUS_COLORS, statusesForOrderType } from '@/lib/orders';
import { bi } from '@/lib/ui-labels';

export type AccountUser = { id: number; name: string; email: string };

type Props = {
  orderType: string;
  status: string;
  dueDate: string;
  assigneeIds: number[];
  tags: string[];
  users: AccountUser[];
  tagSuggestions: string[];
  onStatusChange: (status: string) => void;
  onDueDateChange: (dueDate: string) => void;
  onAssigneesChange: (ids: number[]) => void;
  onTagsChange: (tags: string[]) => void;
};

function IconTarget({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPerson({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.5-3.5 4-5 7-5s5.5 1.5 7 5" strokeLinecap="round" />
    </svg>
  );
}

function IconTag({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 12V5.5A2.5 2.5 0 0 1 5.5 3H12l9 9-8.5 8.5L3 12Z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCalendar({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </svg>
  );
}

function PropertyLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[7.5rem] shrink-0 text-gray-400">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function OrderPropertyBar({
  orderType,
  status,
  dueDate,
  assigneeIds,
  tags,
  users,
  tagSuggestions,
  onStatusChange,
  onDueDateChange,
  onAssigneesChange,
  onTagsChange,
}: Props) {
  const statusOptions = statusesForOrderType(orderType);
  const statusList = statusOptions.includes(status) ? statusOptions : [status, ...statusOptions];

  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const assigneesRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (assigneesRef.current && !assigneesRef.current.contains(t)) setAssigneesOpen(false);
      if (tagsRef.current && !tagsRef.current.contains(t)) {
        setTagsOpen(false);
        setTagQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedUsers = users.filter((u) => assigneeIds.includes(u.id));
  const q = tagQuery.trim();
  const known = Array.from(new Set([...tagSuggestions, ...tags])).sort((a, b) => a.localeCompare(b, 'zh'));
  const filteredTags = q
    ? known.filter((t) => t.toLowerCase().includes(q.toLowerCase()) && !tags.includes(t))
    : known.filter((t) => !tags.includes(t));
  const exactTag = known.some((t) => t.toLowerCase() === q.toLowerCase());

  const toggleAssignee = (id: number) => {
    const next = assigneeIds.includes(id)
      ? assigneeIds.filter((x) => x !== id)
      : [...assigneeIds, id];
    onAssigneesChange(next);
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    onTagsChange([...tags, t]);
    setTagQuery('');
    setTagsOpen(false);
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="mt-3 space-y-2.5">
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <PropertyLabel icon={<IconTarget className="text-gray-400" />} label={bi('Status', '狀態')} />
          <div className="relative min-w-0">
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className={`appearance-none text-xs font-semibold rounded-md pl-2.5 pr-7 py-1.5 border-0 cursor-pointer outline-none ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}
            >
              {statusList.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70">▾</span>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0" ref={assigneesRef}>
          <PropertyLabel icon={<IconPerson className="text-gray-400" />} label={bi('Assignees', '負責人')} />
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setAssigneesOpen((o) => !o)}
              className="flex items-center gap-1.5 flex-wrap text-left min-h-[28px]"
            >
              {selectedUsers.length === 0 ? (
                <span className="text-sm text-gray-400">{bi('Empty', '空白')}</span>
              ) : (
                selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    title={u.name}
                    className="inline-flex items-center justify-center h-7 min-w-[1.75rem] px-1.5 rounded-full bg-brand-100 text-brand-800 text-[11px] font-semibold"
                  >
                    {initials(u.name)}
                  </span>
                ))
              )}
            </button>
            {assigneesOpen && (
              <div className="absolute z-30 mt-1 left-0 w-64 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                {users.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-400">{bi('No users', '沒有用戶')}</p>
                ) : (
                  users.map((u) => {
                    const checked = assigneeIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleAssignee(u.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
                      >
                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${checked ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300 text-transparent'}`}>
                          ✓
                        </span>
                        <span className="font-medium text-gray-900 truncate">{u.name}</span>
                        <span className="text-xs text-gray-400 truncate ml-auto">{u.email}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <PropertyLabel icon={<IconCalendar className="text-gray-400" />} label={bi('Due date', '到期日')} />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className={`text-sm rounded-md px-2 py-1 outline-none border border-transparent hover:border-gray-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 ${
              dueDate ? 'text-gray-900' : 'text-gray-400'
            }`}
          />
        </div>

        <div className="flex items-start gap-3 min-w-0" ref={tagsRef}>
          <PropertyLabel icon={<IconTag className="text-gray-400 mt-1" />} label={bi('Tags', '標籤')} />
          <div className="relative min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  title={bi('Remove tag', '移除標籤')}
                  className="inline-flex items-center gap-1 rounded-md bg-[#C23A8A] text-white text-xs font-medium px-2 py-1 hover:bg-[#A02D6C]"
                >
                  {tag}
                  <span className="opacity-80">×</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTagsOpen((o) => !o)}
                className="text-sm text-gray-400 hover:text-gray-600 px-1"
              >
                {tags.length ? '+' : bi('Empty', '空白')}
              </button>
            </div>
            {tagsOpen && (
              <div className="absolute z-30 mt-1 left-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (q && !exactTag) addTag(q);
                        else if (filteredTags[0]) addTag(filteredTags[0]);
                        else if (q) addTag(q);
                      }
                    }}
                    placeholder={bi('Search or add tag…', '搜尋或新增標籤…')}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {filteredTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {t}
                    </button>
                  ))}
                  {q && !exactTag && (
                    <button
                      type="button"
                      onClick={() => addTag(q)}
                      className="w-full text-left px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 font-medium"
                    >
                      {bi('Add', '新增')} “{q}”
                    </button>
                  )}
                  {!q && filteredTags.length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-400">{bi('Type to add a tag', '輸入以新增標籤')}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
