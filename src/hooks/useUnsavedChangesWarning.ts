'use client';

import { useCallback, useEffect, useRef } from 'react';
import { bi } from '@/lib/ui-labels';

export const UNSAVED_CHANGES_MESSAGE = bi(
  'You have unsaved changes. Leave without saving?',
  '你有未儲存的變更。確定要離開嗎？',
);

/** Warn on browser close/refresh and same-origin in-app link navigation. */
export function useUnsavedChangesWarning(
  isDirty: boolean,
  message: string = UNSAVED_CHANGES_MESSAGE,
) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, message]);

  useEffect(() => {
    if (!isDirty) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash === window.location.hash) {
        return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [isDirty, message]);

  const confirmIfDirty = useCallback((): boolean => {
    if (!isDirtyRef.current) return true;
    return window.confirm(message);
  }, [message]);

  return { confirmIfDirty };
}

/** Warn when a modal/form is open and its snapshot differs from when it was opened. */
export function useModalUnsavedWarning(open: boolean, currentSnapshot: unknown, enabled = true) {
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      baselineRef.current = null;
      return;
    }
    baselineRef.current = serializeFormSnapshot(currentSnapshot);
  }, [open]);

  const isDirty =
    enabled &&
    open &&
    baselineRef.current !== null &&
    baselineRef.current !== serializeFormSnapshot(currentSnapshot);

  useUnsavedChangesWarning(isDirty);
}

export function serializeFormSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

export function isFormDirty(savedSnapshot: string | null, current: unknown): boolean {
  if (savedSnapshot === null) return false;
  return savedSnapshot !== serializeFormSnapshot(current);
}
