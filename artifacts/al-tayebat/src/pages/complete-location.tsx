import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { MapPin, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MapPicker } from "@/components/map-picker";
import { useLanguage } from "@/contexts/language";
import { apiUrl, authHeaders } from "@/lib/api-url";
import { JORDAN_PROVINCES, setStoredCity } from "@/lib/provinces";
import { markLocationSet, clearSignedInState } from "@/lib/location-gate";
import { notifySessionChange } from "@/hooks/use-session";
import { toast } from "sonner";

/**
 * Mandatory location capture. The SplashGate redirects every signed-in user
 * here until they store a permanent delivery location (map pin OR typed
 * address). This becomes the default that auto-populates checkout.
 */
export default function CompleteLocation() {
  const { dir, lang, tr } = useLanguage();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState(
    () => localStorage.getItem("al_tayebat_address") || "",
  );
  const [city, setCity] = useState(
    () => localStorage.getItem("al_tayebat_city") || "",
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const onAddressSelect = (addr: string, lat: number, lng: number) => {
    setAddress(addr);
    setCoords({ lat, lng });
  };

  const canSave = !!coords || address.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      toast.error(
        tr(
          "الرجاء تحديد موقعك الحالي أو كتابة العنوان للمتابعة",
          "Please pick your current location or type your address to continue",
        ),
      );
      return;
    }
    const userId = Number(localStorage.getItem("al_tayebat_user_id"));
    if (!userId) {
      toast.error(tr("انتهت الجلسة، سجّل الدخول مجددًا", "Session expired"));
      setLocation("/auth");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/auth/location"), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          userId,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          address: address.trim() || null,
          city: city || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body.error || tr("فشل حفظ الموقع", "Failed to save location"),
        );
      }
      // Persist locally so checkout auto-populates and the gate releases.
      if (address.trim())
        localStorage.setItem("al_tayebat_address", address.trim());
      if (city) setStoredCity(city);
      markLocationSet();
      toast.success(tr("تم حفظ موقعك بنجاح 🎉", "Location saved 🎉"));
      setLocation("/");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    clearSignedInState();
    try {
      await signOut();
    } catch {
      // ignore — local state is already cleared
    }
    notifySessionChange();
    setLocation("/auth");
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col px-5 py-8"
      dir={dir}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-2 rounded-full">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold">
            {tr("حدّد موقعك الدائم", "Set your permanent location")}
          </h1>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" />
          <span className="text-xs">{tr("خروج", "Sign out")}</span>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-6">
        {tr(
          "لإتمام التسجيل، يرجى تحديد موقع التوصيل الدائم. سيُستخدم هذا الموقع تلقائيًا عند الطلب.",
          "To finish signing up, set your permanent delivery location. It will be used automatically at checkout.",
        )}
      </p>

      <div className="space-y-5 flex-1">
        <div>
          <MapPicker onAddressSelect={onAddressSelect} />
          {coords ? (
            <p className="text-xs text-primary mt-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {tr("تم تحديد الموقع على الخريطة", "Location picked on the map")}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            {tr("المحافظة", "City / Province")}
          </label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full h-11 bg-muted rounded-xl px-3 text-sm border-none outline-none"
          >
            <option value="">{tr("اختر المحافظة", "Select a city")}</option>
            {JORDAN_PROVINCES.map((p) => (
              <option key={p.ar} value={p.ar}>
                {lang === "en" ? p.en : p.ar}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            {tr("العنوان التفصيلي", "Detailed address")}
          </label>
          <Textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={tr(
              "مثال: عمان، تلاع العلي، شارع المدينة المنورة، بناية رقم 5",
              "e.g. Amman, Tla' Al Ali, Madina St, building 5",
            )}
            className="bg-muted border-none rounded-xl min-h-[88px] text-sm"
          />
        </div>
      </div>

      <Button
        type="button"
        className="w-full h-12 rounded-xl mt-6"
        disabled={!canSave || saving}
        onClick={handleSave}
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          tr("حفظ ومتابعة", "Save & continue")
        )}
      </Button>
    </div>
  );
}
