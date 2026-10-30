'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
/** Revalidate the server projection while visible and when returning to the page. */
export function EventJourneyRefresh() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= 30_000) {
        last = Date.now(); router.refresh();
      }
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);};
  }, [router]);
  return null;
}
