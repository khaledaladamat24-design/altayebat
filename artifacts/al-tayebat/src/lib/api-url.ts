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

// Build request headers carrying the caller's identity. Clerk's session cookie
// is sent automatically, but phone-authenticated users have no Clerk session,
// so we also forward their Firebase uid so the server can resolve them.
export function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (typeof window !== "undefined") {
    try {
      const fbUid = window.localStorage.getItem("al_tayebat_firebase_uid");
      if (fbUid) headers["x-firebase-uid"] = fbUid;
    } catch {
      // ignore storage access errors
    }
  }
  return headers;
}
