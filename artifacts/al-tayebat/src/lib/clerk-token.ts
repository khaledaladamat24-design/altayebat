// In the native Capacitor (Android) build the web bundle is served from the
// local filesystem and talks to the deployed API cross-origin, so Clerk's
// `__session` cookie is NEVER sent with API requests. Email/Clerk users would
// therefore be unauthenticated server-side (only phone users, who forward
// `x-firebase-uid`, worked). To fix this we cache the short-lived Clerk session
// JWT here and forward it as `Authorization: Bearer …` so the server's Clerk
// middleware can verify the caller. This is the standard Clerk pattern for
// native/mobile clients.
//
// Gated to native only: on the web the session cookie already authenticates the
// user (same-origin / Clerk proxy), and sending a possibly-stale bearer token
// could shadow the valid cookie — so we never attach it there.

let cachedToken: string | null = null;

export function setClerkToken(token: string | null): void {
  cachedToken = token;
}

export function getClerkToken(): string | null {
  return cachedToken;
}

/** True when running inside the Capacitor native shell (Android app). */
export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!(
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * In native, attach the cached Clerk bearer token to a header map so the
 * cross-origin API can verify the caller. No-op on web.
 */
export function withClerkAuth(
  headers: Record<string, string>,
): Record<string, string> {
  if (isNativePlatform()) {
    const token = getClerkToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}
