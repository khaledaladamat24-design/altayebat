// Mandatory-location gate helpers. A signed-in user must have a permanent
// delivery location before entering the main app (enforced by SplashGate).

const LOCATION_SET_KEY = "al_tayebat_location_set";

// Mirrors settings.tsx SIGNED_IN_KEYS — cleared when the user signs out from
// the location screen instead of completing it.
const SIGNED_IN_KEYS = [
  "al_tayebat_firebase_uid",
  "al_tayebat_user_id",
  "al_tayebat_vendor_id",
  "al_tayebat_email",
  "al_tayebat_phone",
  "al_tayebat_name",
  "al_tayebat_role",
  LOCATION_SET_KEY,
];

export function isSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      !!localStorage.getItem("al_tayebat_firebase_uid") ||
      !!localStorage.getItem("__clerk_db_jwt") ||
      !!localStorage.getItem("al_tayebat_user_id")
    );
  } catch {
    return false;
  }
}

export function hasLocation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(LOCATION_SET_KEY);
  } catch {
    return false;
  }
}

export function markLocationSet(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCATION_SET_KEY, "1");
  } catch {
    // ignore storage write failures (private mode, etc.)
  }
}

// Called on login: if the server profile already carries a saved location,
// release the gate so returning users aren't asked again.
export function syncLocationFlagFromProfile(
  profile: {
    city?: string | null;
    address?: string | null;
  } | null,
): void {
  if (!profile) return;
  if (profile.city || profile.address) markLocationSet();
}

export function clearSignedInState(): void {
  if (typeof window === "undefined") return;
  try {
    SIGNED_IN_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
