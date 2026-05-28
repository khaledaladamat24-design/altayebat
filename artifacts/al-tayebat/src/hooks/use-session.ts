import { useState } from 'react';

function readOrCreateSession(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = window.localStorage.getItem('al_tayebat_session');
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      window.localStorage.setItem('al_tayebat_session', sid);
    }
    return sid;
  } catch {
    return '';
  }
}

// Lazy-initialized state. No useEffect → no extra render cycle on mount.
// This eliminates one source of re-render churn that, combined with the
// Orval `useGetCart` hook returning a fresh queryKey reference each render,
// was crashing the Android WebView with React error #185.
export function useSession() {
  const [sessionId] = useState<string>(readOrCreateSession);
  return sessionId;
}
