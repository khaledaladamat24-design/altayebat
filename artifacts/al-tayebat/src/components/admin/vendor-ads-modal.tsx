import { useEffect, useState } from "react";
import { X, Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/image-upload";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";

interface VendorAd {
  id: number;
  imageUrl: string;
  title: string | null;
  titleAr: string | null;
  linkUrl: string | null;
  sortOrder: number;
}

interface Props {
  vendorId: number;
  vendorName: string;
  adminHeaders: Record<string, string>;
  onClose: () => void;
}

const empty = { imageUrl: "", titleAr: "", linkUrl: "" };

export function VendorAdsModal({
  vendorId,
  vendorName,
  adminHeaders,
  onClose,
}: Props) {
  const { tr, dir } = useLanguage();
  const [ads, setAds] = useState<VendorAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendorId}/ads`));
      if (r.ok) setAds(await r.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...empty });
  };

  const startEdit = (ad: VendorAd) => {
    setEditingId(ad.id);
    setForm({
      imageUrl: ad.imageUrl,
      titleAr: ad.titleAr ?? "",
      linkUrl: ad.linkUrl ?? "",
    });
  };

  const save = async () => {
    if (!form.imageUrl) {
      toast.error(tr("اختر صورة الإعلان", "Choose an ad image"));
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        imageUrl: form.imageUrl,
        titleAr: form.titleAr || null,
        linkUrl: form.linkUrl || null,
      });
      const url = editingId
        ? apiUrl(`/api/vendors/${vendorId}/ads/${editingId}`)
        : apiUrl(`/api/vendors/${vendorId}/ads`);
      const r = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: adminHeaders,
        body,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(data?.error || tr("فشل حفظ الإعلان", "Failed to save ad"));
        return;
      }
      toast.success(
        editingId
          ? tr("تم تعديل الإعلان", "Ad updated")
          : tr("تمت إضافة الإعلان", "Ad added"),
      );
      resetForm();
      load();
    } catch {
      toast.error(tr("فشل حفظ الإعلان", "Failed to save ad"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (adId: number) => {
    if (!confirm(tr("حذف هذا الإعلان؟", "Delete this ad?"))) return;
    try {
      const r = await fetch(apiUrl(`/api/vendors/${vendorId}/ads/${adId}`), {
        method: "DELETE",
        headers: adminHeaders,
      });
      if (!r.ok) throw new Error(String(r.status));
      toast.success(tr("تم حذف الإعلان", "Ad deleted"));
      if (editingId === adId) resetForm();
      load();
    } catch {
      toast.error(tr("فشل حذف الإعلان", "Failed to delete ad"));
    }
  };

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
            {tr("إعلانات", "Ads")} — {vendorName}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {tr("جارٍ التحميل...", "Loading...")}
            </p>
          ) : ads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tr("لا توجد إعلانات", "No ads yet")}
            </p>
          ) : (
            ads.map((ad) => (
              <div
                key={ad.id}
                className="flex items-center gap-2 rounded-xl border border-border p-2"
              >
                <img
                  src={ad.imageUrl}
                  alt=""
                  className="w-14 h-14 rounded-lg object-cover"
                />
                <span className="flex-1 text-sm truncate">
                  {ad.titleAr || ad.title || tr("بدون عنوان", "Untitled")}
                </span>
                <button
                  onClick={() => startEdit(ad)}
                  className="p-2 text-primary hover:bg-primary/10 rounded-lg"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(ad.id)}
                  className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <h3 className="text-sm font-bold">
            {editingId
              ? tr("تعديل الإعلان", "Edit ad")
              : tr("إضافة إعلان", "Add ad")}
          </h3>
          <ImageUpload
            value={form.imageUrl}
            onChange={(url) => setForm((p) => ({ ...p, imageUrl: url }))}
            folder="altayebat_ads"
            label={tr("صورة الإعلان", "Ad image")}
          />
          <Input
            value={form.titleAr}
            onChange={(e) =>
              setForm((p) => ({ ...p, titleAr: e.target.value }))
            }
            placeholder={tr("العنوان (اختياري)", "Title (optional)")}
          />
          <Input
            value={form.linkUrl}
            onChange={(e) =>
              setForm((p) => ({ ...p, linkUrl: e.target.value }))
            }
            placeholder={tr("رابط (اختياري)", "Link (optional)")}
            dir="ltr"
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              {!editingId && <Plus className="w-4 h-4 me-1" />}
              {saving
                ? tr("جارٍ الحفظ...", "Saving...")
                : editingId
                  ? tr("حفظ التعديل", "Save changes")
                  : tr("إضافة", "Add")}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm} className="flex-1">
                {tr("إلغاء", "Cancel")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
