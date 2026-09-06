'use client';

import { useEffect } from 'react';

/** Refetch when the tab becomes visible again (another user may have edited). */
export function useRefetchOnFocus(refetch: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refetch, enabled]);
}
