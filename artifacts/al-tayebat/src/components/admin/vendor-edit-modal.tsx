import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";

export interface EditableVendor {
  id: number;
  storeName: string;
  storeNameAr: string | null;
  category: string;
  city: string | null;
  phone: string | null;
  description?: string | null;
  cliqAlias: string | null;
  walletNumber: string | null;
  bankAccount?: string | null;
  deliveryFeeFixed: string | null;
  freeDeliveryAbove?: string | null;
}

interface Props {
  vendor: EditableVendor;
  adminHeaders: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

export function VendorEditModal({
  vendor,
  adminHeaders,
  onClose,
  onSaved,
}: Props) {
  const { tr, dir } = useLanguage();
  const [f, setF] = useState({
    storeName: vendor.storeName ?? "",
    storeNameAr: vendor.storeNameAr ?? "",
    category: vendor.category ?? "",
    city: vendor.city ?? "",
    phone: vendor.phone ?? "",
    description: vendor.description ?? "",
    cliqAlias: vendor.cliqAlias ?? "",
    walletNumber: vendor.walletNumber ?? "",
    bankAccount: vendor.bankAccount ?? "",
    deliveryFeeFixed: vendor.deliveryFeeFixed ?? "",
    freeDeliveryAbove: vendor.freeDeliveryAbove ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/vendors/${vendor.id}`), {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          storeName: f.storeName.trim(),
          storeNameAr: f.storeNameAr.trim() || null,
          category: f.category.trim(),
          city: f.city.trim() || null,
          phone: f.phone.trim() || null,
          description: f.description.trim() || null,
          cliqAlias: f.cliqAlias.trim() || null,
          walletNumber: f.walletNumber.trim() || null,
          bankAccount: f.bankAccount.trim() || null,
          deliveryFeeFixed: f.deliveryFeeFixed.trim() || null,
          freeDeliveryAbove: f.freeDeliveryAbove.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || tr("فشل حفظ التعديلات", "Failed to save"));
        return;
      }
      toast.success(tr("تم حفظ التعديلات", "Changes saved"));
      onSaved();
      onClose();
    } catch {
      toast.error(tr("فشل حفظ التعديلات", "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof typeof f,
    labelAr: string,
    labelEn: string,
    ltr = false,
  ) => (
    <div>
      <label className="text-xs font-bold text-muted-foreground">
        {tr(labelAr, labelEn)}
      </label>
      <Input
        value={f[key]}
        onChange={(e) => set(key, e.target.value)}
        dir={ltr ? "ltr" : undefined}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      dir={dir}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {tr("تعديل المورّد", "Edit vendor")}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {field("storeNameAr", "اسم المتجر (عربي)", "Store name (Arabic)")}
          {field("storeName", "اسم المتجر (إنجليزي)", "Store name (English)")}
          {field("category", "التصنيف", "Category")}
          {field("city", "المدينة", "City")}
          {field("phone", "رقم الهاتف", "Phone", true)}
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              {tr("الوصف", "Description")}
            </label>
            <Textarea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
            />
          </div>
          <div className="border-t border-border pt-3 text-xs font-bold text-muted-foreground">
            {tr("معلومات الدفع", "Payment info")}
          </div>
          {field("cliqAlias", "اسم/رقم CliQ", "CliQ alias", true)}
          {field("walletNumber", "رقم المحفظة", "Wallet number", true)}
          {field("bankAccount", "الحساب البنكي / IBAN", "Bank / IBAN", true)}
          <div className="border-t border-border pt-3 text-xs font-bold text-muted-foreground">
            {tr("التوصيل", "Delivery")}
          </div>
          {field(
            "deliveryFeeFixed",
            "رسوم التوصيل الثابتة (د.أ)",
            "Fixed delivery fee (JD)",
            true,
          )}
          {field(
            "freeDeliveryAbove",
            "توصيل مجاني فوق (د.أ)",
            "Free delivery above (JD)",
            true,
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? tr("جارٍ الحفظ...", "Saving...") : tr("حفظ", "Save")}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {tr("إلغاء", "Cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
