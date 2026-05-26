const RAW = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!RAW) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  if (RAW.endsWith("/api") && p.startsWith("/api/")) {
    return `${RAW}${p.slice(4)}`;
  }
  return `${RAW}${p}`;
}
