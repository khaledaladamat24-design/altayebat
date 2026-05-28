import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, CreditCard, Wallet, Building2, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-url";
import { Button } from "@/components/ui/button";

type Vendor = {
  id: number;
  userId: number;
  storeName: string;
  storeNameAr: string | null;
  category: string;
  cliqAlias: string | null;
  walletNumber: string | null;
  bankAccount: string | null;
  deliveryFeeFixed: string | null;
  freeDeliveryAbove: string | null;
};

export default function PaymentMethods() {
  const [, setLocation] = useLocation();
  const vendorId = typeof window !== "undefined" ? localStorage.getItem("al_tayebat_vendor_id") : null;
  const userId = typeof window !== "undefined" ? localStorage.getItem("al_tayebat_user_id") : null;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cliqAlias, setCliqAlias] = useState("");
  const [walletNumber, setWalletNumber] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [deliveryFeeFixed, setDeliveryFeeFixed] = useState("1.500");
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState("20.000");

  useEffect(() => {
    if (!vendorId) {
      // Non-vendor users land on /wallet from the account screen instead.
      setLocation("/wallet");
      return;
    }
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/vendors/${vendorId}`));
        if (!res.ok) throw new Error("لم نعثر على متجرك");
        const v = await res.json() as Vendor;
        setVendor(v);
        setCliqAlias(v.cliqAlias || "");
        setWalletNumber(v.walletNumber || "");
        setBankAccount(v.bankAccount || "");
        setDeliveryFeeFixed(v.deliveryFeeFixed || "1.500");
        setFreeDeliveryAbove(v.freeDeliveryAbove || "20.000");
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorId, setLocation]);

  const save = async () => {
    if (!vendor || !userId) return;
    setSaving(true);
    try {
      // The POST /vendors endpoint upserts based on userId — reuse it to keep the
      // server-side update logic in one place.
      const res = await fetch(apiUrl("/api/vendors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(userId),
          storeName: vendor.storeName,
          storeNameAr: vendor.storeNameAr,
          category: vendor.category,
          cliqAlias: cliqAlias.trim() || null,
          walletNumber: walletNumber.trim() || null,
          bankAccount: bankAccount.trim() || null,
          deliveryFeeFixed,
          freeDeliveryAbove,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "فشل حفظ التعديلات");
      }
      toast.success("تم حفظ خيارات الدفع ✓");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24" dir="rtl">
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <button onClick={() => setLocation("/account")} className="p-2 -mr-2 text-foreground">
          <ChevronRight className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-black">خيارات الدفع</h1>
          <p className="text-xs text-muted-foreground">عدّل طرق استلام مدفوعات متجرك</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        <div className="bg-card rounded-2xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <CreditCard className="w-4 h-4" /> كليك CliQ
          </div>
          <input value={cliqAlias} onChange={e => setCliqAlias(e.target.value)} placeholder="معرف كليك (مثال: mystore)" dir="ltr"
            className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" />
          <p className="text-[11px] text-muted-foreground">سيظهر للزبون كـ "@{cliqAlias || "your-alias"}" عند الدفع</p>
        </div>

        <div className="bg-card rounded-2xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <Wallet className="w-4 h-4" /> المحفظة الإلكترونية
          </div>
          <input value={walletNumber} onChange={e => setWalletNumber(e.target.value)} placeholder="رقم المحفظة (مثال: 0791234567)" dir="ltr"
            className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" />
        </div>

        <div className="bg-card rounded-2xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <Building2 className="w-4 h-4" /> الحساب البنكي (اختياري)
          </div>
          <input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="رقم IBAN" dir="ltr"
            className="w-full h-12 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" />
        </div>

        <div className="bg-card rounded-2xl p-4 space-y-3 border border-border">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <MapPin className="w-4 h-4" /> رسوم التوصيل
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">رسوم ثابتة (د.أ)</label>
              <input type="number" step="0.001" value={deliveryFeeFixed} onChange={e => setDeliveryFeeFixed(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" dir="ltr" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">توصيل مجاني فوق (د.أ)</label>
              <input type="number" step="0.001" value={freeDeliveryAbove} onChange={e => setFreeDeliveryAbove(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary" dir="ltr" />
            </div>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full h-13 rounded-full text-base gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </div>
  );
}
