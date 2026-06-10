import { useState, useEffect } from "react";

// Fired whenever the active account changes (login / logout) so every
// `useSession` consumer re-reads its session id without a full page reload.
const SESSION_CHANGE_EVENT = "al-tayebat-session-change";

function newGuestId(): string {
  return (
    "session_" +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
}

function readOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  try {
    // A signed-in user gets a cart/session scoped to their account so two
    // different accounts on the same device never share a cart. Guests fall
    // back to a device-bound random session id.
    const userId = window.localStorage.getItem("al_tayebat_user_id");
    if (userId) return "user_" + userId;
    let sid = window.localStorage.getItem("al_tayebat_session");
    if (!sid) {
      sid = newGuestId();
      window.localStorage.setItem("al_tayebat_session", sid);
    }
    return sid;
  } catch {
    return "";
  }
}

// Call right after a login or logout so all `useSession` consumers immediately
// switch to the new account's cart (no reload needed).
export function notifySessionChange(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

// Replace the guest cart session with a fresh one. Used on logout so the next
// account on the same device starts with an empty cart instead of inheriting
// the previous (guest) session's items.
export function resetGuestSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("al_tayebat_session", newGuestId());
  } catch {}
}

// Reactive session id. Re-reads on login/logout (via SESSION_CHANGE_EVENT) and
// on cross-tab `storage` changes, so the cart always tracks the active account.
export function useSession() {
  const [sessionId, setSessionId] = useState<string>(readOrCreateSession);
  useEffect(() => {
    const update = () => setSessionId(readOrCreateSession());
    window.addEventListener(SESSION_CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return sessionId;
}
