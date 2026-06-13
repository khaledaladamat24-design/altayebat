import { withClerkAuth } from "./clerk-token";

const RAW = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/+$/,
  "",
);

export function apiUrl(path: string): string {
  if (!RAW) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (RAW.endsWith("/api") && p.startsWith("/api/")) {
    return `${RAW}${p.slice(4)}`;
  }
  return `${RAW}${p}`;
}

// Build request headers carrying the caller's identity. On the web Clerk's
// session cookie is sent automatically; phone-authenticated users have no Clerk
// session, so we also forward their Firebase uid. In the native app the cookie
// is cross-origin (never sent), so withClerkAuth attaches the Clerk bearer token
// so email/Clerk users (incl. the super-admin) can still be resolved server-side.
export function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (typeof window !== "undefined") {
    try {
      const fbUid = window.localStorage.getItem("al_tayebat_firebase_uid");
      if (fbUid) headers["x-firebase-uid"] = fbUid;
      // Native: the Clerk cookie is never sent and getToken() returns null in
      // the WebView, so forward the cached Clerk user id (kept by
      // <ClerkTokenSync/>) as an opaque identity header — same trust model as
      // x-firebase-uid. Lets the super-admin/email user be resolved server-side.
      const clerkId = window.localStorage.getItem("al_tayebat_clerk_id");
      if (clerkId) headers["x-clerk-user-id"] = clerkId;
    } catch {
      // ignore storage access errors
    }
  }
  return withClerkAuth(headers);
}
