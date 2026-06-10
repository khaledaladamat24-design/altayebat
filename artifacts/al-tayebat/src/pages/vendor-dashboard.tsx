import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  Plus,
  Check,
  Package,
  Trash2,
  Pencil,
  Store,
  Clock,
  X,
  Bell,
  Phone,
  MapPin,
  Power,
  VolumeX,
  Megaphone,
  Truck,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListCategories } from "@workspace/api-client-react";
import { toast } from "sonner";
import { apiUrl, authHeaders } from "@/lib/api-url";
import { ImageUpload } from "@/components/image-upload";
import { useLanguage } from "@/contexts/language";
import { registerPushForUser } from "@/lib/push";
import { getErrorMessage } from "@/lib/errors";

interface VendorProfile {
  id: number;
  storeName: string;
  storeNameAr: string | null;
  category: string;
  city: string | null;
  status: "pending" | "approved" | "suspended";
  isOnline: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
}

interface VendorOrder {
  id: number;
  status: string;
  fulfillmentType: "delivery" | "pickup";
  paymentMethod: string;
  total: number;
  deliveryAddress: string;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    id: number;
    productNameAr: string;
    productName: string;
    quantity: number;
    totalPrice: number;
  }[];
}

interface VendorAd {
  id: number;
  vendorId: number;
  imageUrl: string;
  title: string | null;
  titleAr: string | null;
  linkUrl: string | null;
  sortOrder: number;
  createdAt: string;
}

// `delivered` is included so an order the customer confirmed as received from
// their own device ("تم الاستلام") stays visible on the board as "تم التسليم"
// until the vendor closes the shift — that's the sync the vendor sees.
const ACTIVE_ORDER_STATUSES =
  "pending,preparing,ready,out_for_delivery,delivered";

interface VendorProduct {
  id: number;
  nameAr: string;
  name: string;
  descriptionAr: string | null;
  description: string | null;
  price: number;
  originalPrice: number | null;
  categoryId: number;
  imageUrl: string | null;
  isKeto: boolean;
  isOrganic: boolean;
  weightOrVolume: string | null;
  inStock: boolean;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  isOnSale: boolean;
  foodType: string;
}

const emptyForm = {
  nameAr: "",
  name: "",
  descriptionAr: "",
  description: "",
  price: "",
  originalPrice: "",
  categoryId: "",
  imageUrl: "",
  weightOrVolume: "",
  isKeto: false,
  isOrganic: false,
  inStock: true,
  isOnSale: false,
  calories: "",
  protein: "",
  carbs: "",
  fats: "",
  foodType: "healthy",
};

export default function VendorDashboard() {
  const [, setLocation] = useLocation();
  const { lang, dir, tr } = useLanguage();
  const { data: categories } = useListCategories();

  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [tab, setTab] = useState<"orders" | "list" | "add" | "ads">("orders");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("al_tayebat_vendor_muted") === "1";
  });
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [closingShift, setClosingShift] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [togglingFulfillment, setTogglingFulfillment] = useState(false);
  const [ads, setAds] = useState<VendorAd[]>([]);
  const [adImageUrl, setAdImageUrl] = useState("");
  const [adTitleAr, setAdTitleAr] = useState("");
  const [savingAd, setSavingAd] = useState(false);

  const openNameEditor = () => {
    if (!vendor) return;
    setNameDraft(vendor.storeNameAr || vendor.storeName || "");
    setEditingName(true);
  };

  const saveStoreName = async () => {
    if (!vendor) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error(tr("الرجاء إدخال اسم المتجر", "Please enter the store name"));
      return;
    }
    setSavingName(true);
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendor.id}`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ storeNameAr: trimmed }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const updated = await r.json();
      setVendor((prev) =>
        prev
          ? {
              ...prev,
              storeNameAr: updated.storeNameAr ?? trimmed,
              storeName: updated.storeName ?? prev.storeName,
            }
          : prev,
      );
      setEditingName(false);
      toast.success(tr("تم تحديث اسم المتجر", "Store name updated"));
    } catch {
      toast.error(tr("فشل تحديث الاسم", "Failed to update the name"));
    } finally {
      setSavingName(false);
    }
  };

  const userId = localStorage.getItem("al_tayebat_user_id");
  const storedVendorId = localStorage.getItem("al_tayebat_vendor_id");

  useEffect(() => {
    const load = async () => {
      if (!userId && !storedVendorId) {
        setLoading(false);
        return;
      }
      try {
        let v: VendorProfile | null = null;
        if (storedVendorId) {
          const r = await fetch(apiUrl(`/api/vendors/${storedVendorId}`));
          if (r.ok) v = await r.json();
        }
        if (!v && userId) {
          const r = await fetch(apiUrl(`/api/vendors/by-user/${userId}`));
          if (r.ok) {
            v = await r.json();
            if (v) localStorage.setItem("al_tayebat_vendor_id", String(v.id));
          }
        }
        setVendor(v);
        if (v && v.status === "approved") {
          const pr = await fetch(apiUrl(`/api/vendors/${v.id}/products`));
          if (pr.ok) setProducts(await pr.json());
          const ar = await fetch(apiUrl(`/api/vendors/${v.id}/ads`));
          if (ar.ok) setAds(await ar.json());
        }
      } catch {
        toast.error(tr("فشل تحميل بيانات المتجر", "Failed to load store data"));
      }
      setLoading(false);
    };
    load();
    // `tr` is only used for an error toast and is recreated every render
    // (not memoized in the language context), so including it would refetch
    // store data on every render. This effect should run only when the
    // vendor identity inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, storedVendorId]);

  // Register this device for new-order push notifications (native only).
  useEffect(() => {
    if (vendor && userId) void registerPushForUser();
  }, [vendor, userId]);

  const refreshProducts = async () => {
    if (!vendor) return;
    const pr = await fetch(apiUrl(`/api/vendors/${vendor.id}/products`));
    if (pr.ok) setProducts(await pr.json());
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Order polling — every 5 s while the dashboard is mounted and the vendor
  // is approved. Pulls only "pending" orders so we can drive the audio alert.
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!vendor || vendor.status !== "approved") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(
          apiUrl(
            `/api/vendors/${vendor.id}/orders?status=${ACTIVE_ORDER_STATUSES}`,
          ),
          { headers: authHeaders() },
        );
        if (!r.ok || cancelled) return;
        const data: VendorOrder[] = await r.json();
        if (!cancelled) setOrders(data);
      } catch {
        /* ignore transient network errors during polling */
      }
    };
    tick();
    const interval = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [vendor]);

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  // ──────────────────────────────────────────────────────────────────────────
  // Looping audio alert. Uses Web Audio API to synthesise a short beep so we
  // don't need to ship an mp3 (Capacitor APK + iOS friendly). Plays every
  // 1.4 s while there's at least one pending order AND the vendor hasn't
  // muted it. Stops the moment pendingCount → 0 or the user accepts.
  // ──────────────────────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    const cleanup = () => {
      if (beepIntervalRef.current !== null) {
        window.clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
    if (muted || pendingCount === 0) {
      cleanup();
      return;
    }

    const playBeep = () => {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) return;
        if (!audioCtxRef.current) audioCtxRef.current = new AC();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const now = ctx.currentTime;
        // Two-tone "ding-dong" pulse — ~600 ms total.
        [
          { f: 880, t: 0 },
          { f: 660, t: 0.18 },
          { f: 880, t: 0.36 },
        ].forEach(({ f, t }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0.0001, now + t);
          gain.gain.exponentialRampToValueAtTime(0.5, now + t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + t);
          osc.stop(now + t + 0.18);
        });
      } catch {
        /* audio unavailable — silent fallback */
      }
    };

    playBeep();
    beepIntervalRef.current = window.setInterval(playBeep, 1400);
    return cleanup;
  }, [pendingCount, muted]);

  // Unmount: tear down the AudioContext so leaving the page silences us.
  useEffect(
    () => () => {
      if (beepIntervalRef.current !== null)
        window.clearInterval(beepIntervalRef.current);
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m;
      try {
        window.localStorage.setItem(
          "al_tayebat_vendor_muted",
          next ? "1" : "0",
        );
      } catch {}
      return next;
    });
  };

  const toggleOnline = async () => {
    if (!vendor || togglingOnline) return;
    const next = !vendor.isOnline;
    setTogglingOnline(true);
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendor.id}`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isOnline: next }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const updated = await r.json();
      setVendor((prev) =>
        prev ? { ...prev, isOnline: Boolean(updated.isOnline) } : prev,
      );
      toast.success(
        next
          ? tr(
              "متجرك الآن متصل ويستقبل الطلبات",
              "Your store is now online and accepting orders",
            )
          : tr(
              "متجرك الآن غير متصل — لن تظهر منتجاتك للزبائن",
              "Your store is now offline — your products won't appear to customers",
            ),
      );
    } catch {
      toast.error(tr("فشل تحديث حالة المتجر", "Failed to update store status"));
    } finally {
      setTogglingOnline(false);
    }
  };

  const acceptOrder = async (orderId: number) => {
    setAcceptingId(orderId);
    try {
      const r = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "preparing" }),
      });
      if (!r.ok) throw new Error(String(r.status));
      // Move it to "preparing" in-place so the beep stops instantly but the
      // order stays visible for the rest of the fulfillment flow.
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "preparing" } : o)),
      );
      toast.success(
        tr(
          `بدأت تحضير الطلب #${orderId}`,
          `Started preparing order #${orderId}`,
        ),
      );
    } catch {
      toast.error(tr("فشل قبول الطلب", "Failed to accept the order"));
    } finally {
      setAcceptingId(null);
    }
  };

  // Advance an order to the next status. Pickup orders skip out_for_delivery
  // (ready → delivered), matching the server-side transition rules.
  const advanceOrder = async (order: VendorOrder, next: string) => {
    setAdvancingId(order.id);
    try {
      const r = await fetch(apiUrl(`/api/orders/${order.id}/status`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) throw new Error(String(r.status));
      // Keep the order on the board with its new status (delivered orders stay
      // visible as "تم التسليم" until the shift is closed). The next poll
      // reconciles with the server anyway.
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)),
      );
      toast.success(tr("تم تحديث حالة الطلب", "Order status updated"));
    } catch {
      toast.error(tr("فشل تحديث الحالة", "Failed to update status"));
    } finally {
      setAdvancingId(null);
    }
  };

  // Vendor-only order cancellation. Customers cannot cancel from the app (by
  // design — they phone the restaurant); the vendor cancels here on their
  // behalf. Allowed for any active stage (preparing / ready / out_for_delivery);
  // pending orders use the Reject button instead.
  const cancelOrder = async (order: VendorOrder) => {
    if (!confirm(tr(`إلغاء الطلب #${order.id}؟`, `Cancel order #${order.id}?`)))
      return;
    setAdvancingId(order.id);
    try {
      const r = await fetch(apiUrl(`/api/orders/${order.id}/status`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: "cancelled" } : o,
        ),
      );
      toast.success(tr("تم إلغاء الطلب", "Order cancelled"));
    } catch {
      toast.error(tr("فشل إلغاء الطلب", "Failed to cancel order"));
    } finally {
      setAdvancingId(null);
    }
  };

  // End-of-shift cleanup: force-cancel every order that's still active so the
  // board starts the next shift empty. Unfinished orders (customer never
  // confirmed receipt, etc.) become "cancelled" rather than "delivered" so they
  // don't inflate sales totals. This is irreversible, hence the confirm dialog.
  const closeShift = async () => {
    if (!vendor || closingShift) return;
    if (
      !confirm(
        tr(
          "سيتم إلغاء كل الطلبات غير المكتملة وتصفير الشاشة. هل أنت متأكد؟",
          "All unfinished orders will be cancelled and the screen cleared. Are you sure?",
        ),
      )
    )
      return;
    setClosingShift(true);
    try {
      const r = await fetch(
        apiUrl(`/api/vendors/${vendor.id}/orders/close-shift`),
        { method: "POST", headers: authHeaders() },
      );
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json().catch(() => ({ cancelled: 0 }));
      setOrders([]);
      toast.success(
        tr(
          `تم تصفير الوردية (${data.cancelled ?? 0} طلب)`,
          `Shift cleared (${data.cancelled ?? 0} orders)`,
        ),
      );
    } catch {
      toast.error(tr("فشل تصفير الوردية", "Failed to clear the shift"));
    } finally {
      setClosingShift(false);
    }
  };

  const toggleFulfillment = async (
    field: "pickupEnabled" | "deliveryEnabled",
  ) => {
    if (!vendor || togglingFulfillment) return;
    const next = !vendor[field];
    setTogglingFulfillment(true);
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendor.id}`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ [field]: next }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const updated = await r.json();
      setVendor((prev) =>
        prev ? { ...prev, [field]: Boolean(updated[field]) } : prev,
      );
    } catch {
      toast.error(tr("فشل تحديث خيارات الاستلام", "Failed to update options"));
    } finally {
      setTogglingFulfillment(false);
    }
  };

  const addAd = async () => {
    if (!vendor || savingAd) return;
    if (!adImageUrl) {
      toast.error(tr("اختر صورة الإعلان", "Choose an ad image"));
      return;
    }
    setSavingAd(true);
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendor.id}/ads`), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          imageUrl: adImageUrl,
          titleAr: adTitleAr || null,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(getErrorMessage(data) || tr("فشل إضافة الإعلان", "Failed"));
        return;
      }
      setAds((prev) => [...prev, data]);
      setAdImageUrl("");
      setAdTitleAr("");
      toast.success(tr("تمت إضافة الإعلان", "Ad added"));
    } catch {
      toast.error(tr("فشل إضافة الإعلان", "Failed to add the ad"));
    } finally {
      setSavingAd(false);
    }
  };

  const deleteAd = async (adId: number) => {
    if (!vendor) return;
    if (!confirm(tr("حذف هذا الإعلان؟", "Delete this ad?"))) return;
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendor.id}/ads/${adId}`), {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(String(r.status));
      setAds((prev) => prev.filter((a) => a.id !== adId));
      toast.success(tr("تم حذف الإعلان", "Ad deleted"));
    } catch {
      toast.error(tr("فشل حذف الإعلان", "Failed to delete the ad"));
    }
  };

  const rejectOrder = async (orderId: number) => {
    if (!confirm(tr(`رفض الطلب #${orderId}؟`, `Reject order #${orderId}?`)))
      return;
    setAcceptingId(orderId);
    try {
      const r = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      toast.success(tr("تم رفض الطلب", "Order rejected"));
    } catch {
      toast.error(tr("فشل رفض الطلب", "Failed to reject the order"));
    } finally {
      setAcceptingId(null);
    }
  };

  const startEdit = (p: VendorProduct) => {
    setEditingId(p.id);
    setForm({
      nameAr: p.nameAr,
      name: p.name,
      descriptionAr: p.descriptionAr || "",
      description: p.description || "",
      price: String(p.price),
      originalPrice: p.originalPrice ? String(p.originalPrice) : "",
      categoryId: String(p.categoryId),
      imageUrl: p.imageUrl || "",
      weightOrVolume: p.weightOrVolume || "",
      isKeto: p.isKeto,
      isOrganic: p.isOrganic,
      inStock: p.inStock,
      isOnSale: p.isOnSale,
      calories: p.calories ? String(p.calories) : "",
      protein: p.protein ? String(p.protein) : "",
      carbs: p.carbs ? String(p.carbs) : "",
      fats: p.fats ? String(p.fats) : "",
      foodType:
        p.foodType === "regular" || p.foodType === "grocery"
          ? p.foodType
          : "healthy",
    });
    setTab("add");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setTab("list");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    if (!form.nameAr || !form.name || !form.price || !form.categoryId) {
      toast.error(
        tr("يرجى تعبئة الحقول المطلوبة", "Please fill out the required fields"),
      );
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? apiUrl(`/api/vendors/${vendor.id}/products/${editingId}`)
        : apiUrl(`/api/vendors/${vendor.id}/products`);
      const method = editingId ? "PATCH" : "POST";
      const body = {
        ...form,
        price: Number(form.price),
        originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
        categoryId: Number(form.categoryId),
        calories: form.calories || null,
        protein: form.protein || null,
        carbs: form.carbs || null,
        fats: form.fats || null,
      };
      const res = await fetch(url, {
        method,
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || tr("فشل الحفظ", "Failed to save"));
      }
      toast.success(
        editingId
          ? tr("تم تحديث المنتج", "Product updated")
          : tr("تمت إضافة المنتج", "Product added"),
      );
      setForm(emptyForm);
      setEditingId(null);
      setTab("list");
      await refreshProducts();
    } catch (err) {
      toast.error(
        getErrorMessage(err) || tr("حدث خطأ", "Something went wrong"),
      );
    }
    setSaving(false);
  };

  const handleDelete = async (id: number, displayName: string) => {
    if (!vendor) return;
    if (!confirm(tr(`حذف "${displayName}"؟`, `Delete "${displayName}"?`)))
      return;
    const res = await fetch(
      apiUrl(`/api/vendors/${vendor.id}/products/${id}`),
      { method: "DELETE", headers: authHeaders() },
    );
    if (res.ok) {
      toast.success(tr("تم الحذف", "Deleted"));
      setProducts((ps) => ps.filter((p) => p.id !== id));
    } else toast.error(tr("فشل الحذف", "Delete failed"));
  };

  const storeDisplayName = vendor
    ? lang === "en"
      ? vendor.storeName || vendor.storeNameAr || ""
      : vendor.storeNameAr || vendor.storeName || ""
    : "";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir={dir}>
        <div className="text-muted-foreground">
          {tr("جاري التحميل...", "Loading...")}
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div
        className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6"
        dir={dir}
      >
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Store className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">
            {tr("لا يوجد متجر", "No store yet")}
          </h1>
          <p className="text-muted-foreground text-sm mb-5">
            {tr(
              "سجّل كبائع لتتمكن من إضافة منتجاتك",
              "Register as a seller to start adding your products",
            )}
          </p>
          <Button
            className="w-full h-12 rounded-xl"
            onClick={() => setLocation("/register")}
          >
            {tr("تسجيل متجر", "Register a store")}
          </Button>
          <button
            onClick={() => setLocation("/account")}
            className="mt-4 w-full text-sm text-muted-foreground"
          >
            {tr("عودة", "Back")}
          </button>
        </div>
      </div>
    );
  }

  if (vendor.status !== "approved") {
    return (
      <div
        className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6"
        dir={dir}
      >
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold mb-2">{storeDisplayName}</h1>
          <p className="text-muted-foreground text-sm mb-2">
            {vendor.status === "pending"
              ? tr(
                  "متجرك قيد المراجعة من قبل الإدارة",
                  "Your store is under review by the admin team",
                )
              : tr("متجرك موقوف حالياً", "Your store is currently suspended")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr(
              "سيتم تفعيل صلاحيات إدارة المنتجات بعد الموافقة.",
              "Product management will be enabled once approved.",
            )}
          </p>
          <button
            onClick={() => setLocation("/account")}
            className="mt-6 w-full text-sm text-primary font-bold"
          >
            {tr("العودة لحسابي", "Back to my account")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8 min-h-screen bg-muted/30" dir={dir}>
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-10 pb-4 px-4 flex items-center gap-3 rounded-b-2xl">
        <button onClick={() => setLocation("/account")} className="p-1.5 -mr-1">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-8 text-foreground text-sm bg-background/90 border-none rounded-md"
                autoFocus
              />
              <button
                onClick={saveStoreName}
                disabled={savingName}
                className="p-1 rounded-md bg-background/20 hover:bg-background/30 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setEditingName(false)}
                disabled={savingName}
                className="p-1 rounded-md bg-background/20 hover:bg-background/30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={openNameEditor}
              className="flex items-center gap-1.5 text-right group"
            >
              <h1 className="text-lg font-bold">{storeDisplayName}</h1>
              <Pencil className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100" />
            </button>
          )}
          <p className="text-xs text-primary-foreground/80 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" /> {tr("متجر مفعّل", "Store active")} ·{" "}
              {tr(`${products.length} منتج`, `${products.length} products`)}
            </span>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${vendor.isOnline ? "bg-emerald-500/30" : "bg-zinc-500/40"}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${vendor.isOnline ? "bg-emerald-300" : "bg-zinc-300"}`}
              />
              {vendor.isOnline
                ? tr("متصل", "Online")
                : tr("غير متصل", "Offline")}
            </span>
          </p>
        </div>

        {/* Online/Offline toggle — pauses incoming orders by hiding products from the home feed */}
        <button
          onClick={toggleOnline}
          disabled={togglingOnline}
          aria-pressed={vendor.isOnline}
          aria-label={
            vendor.isOnline
              ? tr("إيقاف استقبال الطلبات", "Stop accepting orders")
              : tr("تشغيل استقبال الطلبات", "Start accepting orders")
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${vendor.isOnline ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"}`}
        >
          <Power className="w-3.5 h-3.5" />
          {vendor.isOnline ? tr("متصل", "Online") : tr("غير متصل", "Offline")}
        </button>
      </div>

      {/* Fulfillment options — delivery / pickup the store offers */}
      <div className="bg-background border-b border-border px-4 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-muted-foreground">
          {tr("خيارات الاستلام:", "Fulfillment:")}
        </span>
        <button
          onClick={() => toggleFulfillment("deliveryEnabled")}
          disabled={togglingFulfillment}
          aria-pressed={vendor.deliveryEnabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${vendor.deliveryEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          <Truck className="w-3.5 h-3.5" /> {tr("توصيل", "Delivery")}
        </button>
        <button
          onClick={() => toggleFulfillment("pickupEnabled")}
          disabled={togglingFulfillment}
          aria-pressed={vendor.pickupEnabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${vendor.pickupEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />{" "}
          {tr("استلام من المتجر", "Pickup")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background sticky top-0 z-10">
        {[
          { id: "orders" as const, icon: Bell, label: tr("الطلبات", "Orders") },
          {
            id: "list" as const,
            icon: Package,
            label: tr("منتجاتي", "My products"),
          },
          {
            id: "add" as const,
            icon: Plus,
            label: editingId
              ? tr("تعديل المنتج", "Edit product")
              : tr("إضافة منتج", "Add product"),
          },
          {
            id: "ads" as const,
            icon: Megaphone,
            label: tr("الإعلانات", "Ads"),
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === "list") cancelEdit();
              else setTab(t.id);
            }}
            className={`relative flex-1 py-3 text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 ${tab === t.id ? "border-rose text-rose" : "border-transparent text-muted-foreground"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            {t.id === "orders" && pendingCount > 0 && (
              <span className="absolute top-1.5 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose text-white text-[10px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "orders" && pendingCount > 0 && !muted && (
        <div className="bg-amber-100 border-y border-amber-300 px-4 py-2 flex items-center justify-between text-sm">
          <span className="font-bold text-amber-800 flex items-center gap-1.5">
            <Bell className="w-4 h-4 animate-pulse" />{" "}
            {tr(
              `${pendingCount} طلب جديد بانتظار القبول`,
              `${pendingCount} new order${pendingCount === 1 ? "" : "s"} awaiting acceptance`,
            )}
          </span>
          <button
            onClick={toggleMuted}
            className="text-amber-800 flex items-center gap-1 text-xs font-bold hover:underline"
          >
            <VolumeX className="w-3.5 h-3.5" />{" "}
            {tr("إيقاف الصوت", "Mute sound")}
          </button>
        </div>
      )}
      {tab === "orders" && muted && (
        <div className="bg-zinc-100 border-y border-zinc-300 px-4 py-2 flex items-center justify-between text-xs">
          <span className="text-zinc-700">
            {tr("الصوت متوقف", "Sound is muted")}
          </span>
          <button
            onClick={toggleMuted}
            className="text-primary font-bold hover:underline"
          >
            {tr("تشغيل التنبيه الصوتي", "Enable sound alerts")}
          </button>
        </div>
      )}

      <div className="px-4 py-5">
        {tab === "orders" && (
          <div className="space-y-3">
            {orders.length > 0 && (
              <div className="flex justify-end">
                <Button
                  onClick={closeShift}
                  disabled={closingShift}
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                  data-testid="button-close-shift"
                >
                  <X className="w-4 h-4" />
                  {closingShift
                    ? tr("جارٍ التصفير...", "Clearing...")
                    : tr("تصفير الوردية", "Close shift")}
                </Button>
              </div>
            )}
            {orders.length === 0 ? (
              <div className="text-center py-16">
                <Bell className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  {tr("لا توجد طلبات جديدة حالياً", "No new orders right now")}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {tr(
                    "سنشغّل تنبيهاً صوتياً عند وصول أي طلب",
                    "We'll play a sound alert as soon as an order arrives",
                  )}
                </p>
              </div>
            ) : (
              orders.map((o) => (
                <div
                  key={o.id}
                  className="bg-card rounded-xl border-2 border-rose/40 p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">
                        {tr(`طلب #${o.id}`, `Order #${o.id}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString(
                          lang === "ar" ? "ar-JO" : "en-JO",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          },
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-rose/10 text-rose px-2 py-1 rounded-full font-bold">
                        {o.status === "pending"
                          ? tr("جديد", "New")
                          : o.status === "preparing"
                            ? tr("قيد التحضير", "Preparing")
                            : o.status === "ready"
                              ? tr("جاهز", "Ready")
                              : o.status === "out_for_delivery"
                                ? tr("خرج للتوصيل", "Out for delivery")
                                : o.status === "delivered"
                                  ? tr("تم التسليم", "Delivered")
                                  : o.status === "cancelled"
                                    ? tr("ملغي", "Cancelled")
                                    : o.status}
                      </span>
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        {o.fulfillmentType === "pickup" ? (
                          <>
                            <ShoppingBag className="w-3 h-3" />{" "}
                            {tr("استلام", "Pickup")}
                          </>
                        ) : (
                          <>
                            <Truck className="w-3 h-3" />{" "}
                            {tr("توصيل", "Delivery")}
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 text-muted-foreground">
                    {o.customerName && (
                      <p className="font-bold text-foreground">
                        {o.customerName}
                      </p>
                    )}
                    {o.customerPhone && (
                      <a
                        href={`tel:${o.customerPhone}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                        dir="ltr"
                      >
                        <Phone className="w-3 h-3" /> {o.customerPhone}
                      </a>
                    )}
                    <p className="flex items-start gap-1">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{" "}
                      {o.deliveryAddress}
                    </p>
                    {o.notes && <p className="italic">"{o.notes}"</p>}
                  </div>

                  <div className="border-t border-border pt-2 space-y-1">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex justify-between text-xs">
                        <span>
                          {lang === "en"
                            ? it.productName || it.productNameAr
                            : it.productNameAr || it.productName}{" "}
                          × {it.quantity}
                        </span>
                        <span className="text-muted-foreground">
                          {Number(it.totalPrice).toFixed(3)} {tr("د.أ", "JOD")}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-xs text-muted-foreground">
                      {o.paymentMethod}
                    </span>
                    <span className="font-bold text-sm">
                      {Number(o.total).toFixed(3)} {tr("د.أ", "JOD")}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {o.status === "pending" && (
                      <>
                        <Button
                          onClick={() => acceptOrder(o.id)}
                          disabled={acceptingId === o.id}
                          className="flex-1 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="w-4 h-4" />{" "}
                          {tr("قبول وبدء التحضير", "Accept & start preparing")}
                        </Button>
                        <Button
                          onClick={() => rejectOrder(o.id)}
                          disabled={acceptingId === o.id}
                          variant="outline"
                          className="rounded-xl gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                        >
                          <X className="w-4 h-4" /> {tr("رفض", "Reject")}
                        </Button>
                      </>
                    )}
                    {o.status === "preparing" && (
                      <Button
                        onClick={() => advanceOrder(o, "ready")}
                        disabled={advancingId === o.id}
                        className="flex-1 rounded-xl gap-1.5 bg-amber-600 hover:bg-amber-700"
                      >
                        <Check className="w-4 h-4" />{" "}
                        {o.fulfillmentType === "pickup"
                          ? tr("جاهز للاستلام", "Ready for pickup")
                          : tr("جاهز للتوصيل", "Ready for delivery")}
                      </Button>
                    )}
                    {o.status === "ready" &&
                      (o.fulfillmentType === "pickup" ? (
                        <Button
                          onClick={() => advanceOrder(o, "delivered")}
                          disabled={advancingId === o.id}
                          className="flex-1 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <ShoppingBag className="w-4 h-4" />{" "}
                          {tr("تم الاستلام", "Picked up")}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => advanceOrder(o, "out_for_delivery")}
                          disabled={advancingId === o.id}
                          className="flex-1 rounded-xl gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                        >
                          <Truck className="w-4 h-4" />{" "}
                          {tr("خرج للتوصيل", "Out for delivery")}
                        </Button>
                      ))}
                    {o.status === "out_for_delivery" && (
                      <Button
                        onClick={() => advanceOrder(o, "delivered")}
                        disabled={advancingId === o.id}
                        className="flex-1 rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Check className="w-4 h-4" />{" "}
                        {tr("تم التسليم", "Delivered")}
                      </Button>
                    )}
                    {(o.status === "preparing" ||
                      o.status === "ready" ||
                      o.status === "out_for_delivery") && (
                      <Button
                        onClick={() => cancelOrder(o)}
                        disabled={advancingId === o.id}
                        variant="outline"
                        data-testid={`button-cancel-order-${o.id}`}
                        className="rounded-xl gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-4 h-4" /> {tr("إلغاء", "Cancel")}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "list" && (
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm mb-4">
                  {tr("لا توجد منتجات بعد", "No products yet")}
                </p>
                <Button
                  onClick={() => setTab("add")}
                  className="rounded-xl gap-2"
                >
                  <Plus className="w-4 h-4" />{" "}
                  {tr("أضف منتجك الأول", "Add your first product")}
                </Button>
              </div>
            ) : (
              products.map((p) => {
                const displayName =
                  lang === "en" ? p.name || p.nameAr : p.nameAr;
                return (
                  <div
                    key={p.id}
                    className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"
                  >
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={displayName}
                        className="w-14 h-14 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Package className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">
                        {displayName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Number(p.price).toFixed(3)} {tr("د.أ", "JOD")}
                      </p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.isKeto && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {tr("كيتو", "Keto")}
                          </span>
                        )}
                        {p.isOrganic && (
                          <span className="text-[10px] bg-rose/10 text-rose px-1.5 py-0.5 rounded-full">
                            {tr("عضوي", "Organic")}
                          </span>
                        )}
                        {!p.inStock && (
                          <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                            {tr("نفد", "Out of stock")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-primary p-2 hover:bg-primary/10 rounded-lg"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, displayName)}
                        className="text-destructive p-2 hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "add" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {editingId && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700">
                  {tr("تعديل منتج موجود", "Editing existing product")}
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-amber-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("الاسم بالعربي *", "Arabic name *")}
                  </label>
                  <Input
                    value={form.nameAr}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nameAr: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("الاسم بالإنجليزي *", "English name *")}
                  </label>
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("وصف بالعربي", "Arabic description")}
                </label>
                <Textarea
                  value={form.descriptionAr}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descriptionAr: e.target.value }))
                  }
                  className="bg-muted border-none resize-none text-sm min-h-[60px]"
                />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("السعر (د.أ) *", "Price (JOD) *")}
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("السعر قبل الخصم", "Price before discount")}
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    value={form.originalPrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, originalPrice: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("القسم الرئيسي *", "Main section *")}
                  </label>
                  <select
                    value={form.foodType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        foodType: e.target.value,
                        categoryId: "",
                      }))
                    }
                    className="w-full h-11 bg-muted rounded-xl px-3 text-sm border-none outline-none"
                  >
                    <option value="healthy">{tr("صحي", "Healthy")}</option>
                    <option value="regular">{tr("متنوع", "Diverse")}</option>
                    <option value="grocery">{tr("بقالة", "Grocery")}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("الصنف *", "Category *")}
                  </label>
                  <select
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryId: e.target.value }))
                    }
                    className="w-full h-11 bg-muted rounded-xl px-3 text-sm border-none outline-none"
                    required
                  >
                    <option value="">
                      {tr("اختر الصنف", "Select a category")}
                    </option>
                    {categories
                      ?.filter((c) => c.foodType === form.foodType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {lang === "en" ? c.name || c.nameAr : c.nameAr}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("الوزن / الحجم", "Weight / volume")}
                </label>
                <Input
                  value={form.weightOrVolume}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weightOrVolume: e.target.value }))
                  }
                  className="h-11 bg-muted border-none text-sm"
                  placeholder="500g"
                />
              </div>
              <ImageUpload
                value={form.imageUrl}
                onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              />
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground">
                {tr(
                  "القيم الغذائية (اختياري)",
                  "Nutritional values (optional)",
                )}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: "calories", label: tr("🔥 السعرات", "🔥 Calories") },
                  {
                    k: "protein",
                    label: tr("🍗 بروتين (غ)", "🍗 Protein (g)"),
                  },
                  {
                    k: "carbs",
                    label: tr("🌾 كربوهيدرات (غ)", "🌾 Carbs (g)"),
                  },
                  { k: "fats", label: tr("🥑 دهون (غ)", "🥑 Fats (g)") },
                ].map(({ k, label }) => (
                  <div key={k} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {label}
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={form[k as keyof typeof form] as string}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [k]: e.target.value }))
                      }
                      className="h-11 bg-muted border-none text-sm"
                      dir="ltr"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "isKeto", label: tr("كيتو", "Keto") },
                  { key: "isOrganic", label: tr("عضوي", "Organic") },
                  { key: "inStock", label: tr("متوفر", "In stock") },
                  { key: "isOnSale", label: tr("عرض / تخفيض", "On sale") },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-3 rounded-xl bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form[key as keyof typeof form] as boolean}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.checked }))
                      }
                      className="w-4 h-4 accent-rose"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-13 rounded-xl text-base font-bold gap-2 bg-rose hover:bg-rose/90"
            >
              {saving ? (
                tr("جاري الحفظ...", "Saving...")
              ) : editingId ? (
                <>
                  <Check className="w-5 h-5" />{" "}
                  {tr("حفظ التعديلات", "Save changes")}
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />{" "}
                  {tr("إضافة المنتج", "Add product")}
                </>
              )}
            </Button>
          </form>
        )}

        {tab === "ads" && (
          <div className="space-y-5">
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-rose" />{" "}
                {tr("إضافة إعلان جديد", "Add a new ad")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {tr(
                  `الإعلانات صور فقط (بدون فيديو) — حتى ${ads.length}/10 لكل متجر`,
                  `Ads are images only (no video) — up to ${ads.length}/10 per store`,
                )}
              </p>
              <ImageUpload value={adImageUrl} onChange={setAdImageUrl} />
              <Input
                value={adTitleAr}
                onChange={(e) => setAdTitleAr(e.target.value)}
                placeholder={tr(
                  "عنوان الإعلان (اختياري)",
                  "Ad title (optional)",
                )}
                className="rounded-xl"
              />
              <Button
                onClick={addAd}
                disabled={savingAd || ads.length >= 10}
                className="w-full rounded-xl gap-2 bg-rose hover:bg-rose/90"
              >
                <Plus className="w-4 h-4" />
                {ads.length >= 10
                  ? tr("بلغت الحد الأقصى", "Limit reached")
                  : savingAd
                    ? tr("جاري الحفظ...", "Saving...")
                    : tr("إضافة الإعلان", "Add ad")}
              </Button>
            </div>

            {ads.length === 0 ? (
              <div className="text-center py-12">
                <Megaphone className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  {tr("لا توجد إعلانات بعد", "No ads yet")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {ads.map((ad) => (
                  <div
                    key={ad.id}
                    className="relative rounded-xl overflow-hidden border border-border bg-card"
                  >
                    <img
                      src={ad.imageUrl}
                      alt={ad.titleAr || ""}
                      className="w-full h-28 object-cover"
                    />
                    {ad.titleAr && (
                      <p className="text-xs p-2 truncate">{ad.titleAr}</p>
                    )}
                    <button
                      onClick={() => deleteAd(ad.id)}
                      aria-label={tr("حذف الإعلان", "Delete ad")}
                      className="absolute top-1.5 left-1.5 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
