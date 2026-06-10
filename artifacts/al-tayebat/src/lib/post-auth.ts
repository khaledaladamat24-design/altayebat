// Shared helper for the "return to where you were after signing in" flow.
// When a guest tries to do something that needs an account (e.g. pay with a
// non-cash method at checkout), we stash the path to come back to here, send
// them through the auth flow, then bring them back to finish what they started.
const RETURN_KEY = "al_tayebat_return_to";

export function setReturnTo(path: string): void {
  try {
    localStorage.setItem(RETURN_KEY, path);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

// Reads and clears the stored return path. Returns null when none is set.
export function takeReturnTo(): string | null {
  try {
    const v = localStorage.getItem(RETURN_KEY);
    if (v) localStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}
