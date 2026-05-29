import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/language";
import "leaflet/dist/leaflet.css";

interface MapPickerProps {
  onAddressSelect: (address: string, lat: number, lng: number) => void;
}

interface NominatimResult {
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    house_number?: string;
    state?: string;
    country?: string;
  };
}

async function reverseGeocode(lat: number, lng: number, lang: "ar" | "en"): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}`,
      { headers: { "User-Agent": "AlTayebat-App/1.0" } }
    );
    const data: NominatimResult = await res.json();
    const a = data.address;
    const parts = [
      a.city || a.town || a.village,
      a.suburb || a.neighbourhood,
      a.road,
      a.house_number,
    ].filter(Boolean);
    const sep = lang === "ar" ? "، " : ", ";
    return parts.length > 0 ? parts.join(sep) : data.display_name;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export function MapPicker({ onAddressSelect }: MapPickerProps) {
  const { lang, dir, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setPickedCoords({ lat, lng });
    const address = await reverseGeocode(lat, lng, lang);
    setResolvedAddress(address);
    setLoading(false);
  }, [lang]);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    let L: typeof import("leaflet");

    (async () => {
      L = (await import("leaflet")).default;

      // Fix leaflet default icon path
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapContainerRef.current || mapRef.current || !mounted) return;

      // Default to Amman, Jordan
      const defaultLat = 31.9539;
      const defaultLng = 35.9106;

      const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(
        [defaultLat, defaultLng],
        13
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);
      markerRef.current = marker;
      mapRef.current = map;

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        handleMapClick(pos.lat, pos.lng);
      });

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        handleMapClick(e.latlng.lat, e.latlng.lng);
      });

      handleMapClick(defaultLat, defaultLng);
    })();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [open, handleMapClick]);

  const locateMe = () => {
    if (!navigator.geolocation || !mapRef.current || !markerRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current!.setView([latitude, longitude], 16);
        markerRef.current!.setLatLng([latitude, longitude]);
        handleMapClick(latitude, longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  const confirmAddress = () => {
    if (!pickedCoords || !resolvedAddress) return;
    onAddressSelect(resolvedAddress, pickedCoords.lat, pickedCoords.lng);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 border-rose text-rose hover:bg-rose-soft"
        onClick={() => setOpen(true)}
      >
        <MapPin className="w-4 h-4" />
        {tr("تحديد موقعك على الخريطة", "Pick your location on the map")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0" dir={dir}>
          <div className="p-4 border-b border-border flex items-center justify-between bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-soft" />
              <h2 className="font-bold text-lg">{tr("تحديد موقع التوصيل", "Choose delivery location")}</h2>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-primary-foreground hover:bg-primary-foreground/10 gap-1"
              onClick={locateMe}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
              <span className="text-xs">{tr("موقعي الحالي", "My current location")}</span>
            </Button>
          </div>

          <div
            ref={mapContainerRef}
            className="w-full"
            style={{ height: 340 }}
          />

          <div className="p-4 space-y-3 bg-background">
            <div className="flex items-start gap-2 bg-muted rounded-xl p-3 min-h-[52px]">
              <MapPin className="w-4 h-4 text-rose mt-0.5 shrink-0" />
              {loading ? (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> {tr("جاري تحديد العنوان...", "Looking up address...")}
                </span>
              ) : (
                <span className="text-sm font-medium leading-relaxed">
                  {resolvedAddress || tr("انقر على الخريطة لتحديد موقعك", "Tap the map to pick your location")}
                </span>
              )}
            </div>

            <Button
              type="button"
              className="w-full h-12 rounded-xl bg-rose hover:bg-rose/90 text-white"
              disabled={!resolvedAddress || loading}
              onClick={confirmAddress}
            >
              {tr("تأكيد هذا الموقع", "Confirm this location")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
