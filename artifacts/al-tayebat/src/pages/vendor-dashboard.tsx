import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Plus, Check, Package, Trash2, Pencil, Store, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListCategories } from "@workspace/api-client-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-url";

interface VendorProfile {
  id: number;
  storeName: string;
  storeNameAr: string | null;
  category: string;
  city: string | null;
  status: "pending" | "approved" | "suspended";
}

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
}

const emptyForm = {
  nameAr: "", name: "", descriptionAr: "", description: "",
  price: "", originalPrice: "", categoryId: "", imageUrl: "", weightOrVolume: "",
  isKeto: false, isOrganic: false, inStock: true,
  calories: "", protein: "", carbs: "", fats: "",
};

export default function VendorDashboard() {
  const [, setLocation] = useLocation();
  const { data: categories } = useListCategories();

  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [tab, setTab] = useState<"list" | "add">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
        }
      } catch {
        toast.error("فشل تحميل بيانات المتجر");
      }
      setLoading(false);
    };
    load();
  }, [userId, storedVendorId]);

  const refreshProducts = async () => {
    if (!vendor) return;
    const pr = await fetch(apiUrl(`/api/vendors/${vendor.id}/products`));
    if (pr.ok) setProducts(await pr.json());
  };

  const startEdit = (p: VendorProduct) => {
    setEditingId(p.id);
    setForm({
      nameAr: p.nameAr, name: p.name,
      descriptionAr: p.descriptionAr || "", description: p.description || "",
      price: String(p.price), originalPrice: p.originalPrice ? String(p.originalPrice) : "",
      categoryId: String(p.categoryId), imageUrl: p.imageUrl || "",
      weightOrVolume: p.weightOrVolume || "",
      isKeto: p.isKeto, isOrganic: p.isOrganic, inStock: p.inStock,
      calories: p.calories ? String(p.calories) : "",
      protein: p.protein ? String(p.protein) : "",
      carbs: p.carbs ? String(p.carbs) : "",
      fats: p.fats ? String(p.fats) : "",
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
      toast.error("يرجى تعبئة الحقول المطلوبة"); return;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "فشل الحفظ");
      }
      toast.success(editingId ? "تم تحديث المنتج" : "تمت إضافة المنتج");
      setForm(emptyForm);
      setEditingId(null);
      setTab("list");
      await refreshProducts();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    }
    setSaving(false);
  };

  const handleDelete = async (id: number, nameAr: string) => {
    if (!vendor) return;
    if (!confirm(`حذف "${nameAr}"؟`)) return;
    const res = await fetch(apiUrl(`/api/vendors/${vendor.id}/products/${id}`), { method: "DELETE" });
    if (res.ok) {
      toast.success("تم الحذف");
      setProducts(ps => ps.filter(p => p.id !== id));
    } else toast.error("فشل الحذف");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Store className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">لا يوجد متجر</h1>
          <p className="text-muted-foreground text-sm mb-5">سجّل كصاحب مطعم أو مورد لتتمكن من إضافة منتجاتك</p>
          <Button className="w-full h-12 rounded-xl" onClick={() => setLocation("/register")}>تسجيل متجر</Button>
          <button onClick={() => setLocation("/account")} className="mt-4 w-full text-sm text-muted-foreground">عودة</button>
        </div>
      </div>
    );
  }

  if (vendor.status !== "approved") {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold mb-2">{vendor.storeNameAr || vendor.storeName}</h1>
          <p className="text-muted-foreground text-sm mb-2">
            {vendor.status === "pending" ? "متجرك قيد المراجعة من قبل الإدارة" : "متجرك موقوف حالياً"}
          </p>
          <p className="text-xs text-muted-foreground">سيتم تفعيل صلاحيات إدارة المنتجات بعد الموافقة.</p>
          <button onClick={() => setLocation("/account")} className="mt-6 w-full text-sm text-primary font-bold">العودة لحسابي</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8 min-h-screen bg-muted/30" dir="rtl">
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-10 pb-4 px-4 flex items-center gap-3 rounded-b-2xl">
        <button onClick={() => setLocation("/account")} className="p-1.5 -mr-1">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{vendor.storeNameAr || vendor.storeName}</h1>
          <p className="text-xs text-primary-foreground/80 flex items-center gap-1">
            <Check className="w-3 h-3" /> متجر مفعّل · {products.length} منتج
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background sticky top-0 z-10">
        {[
          { id: "list" as const, icon: Package, label: "منتجاتي" },
          { id: "add" as const, icon: Plus, label: editingId ? "تعديل المنتج" : "إضافة منتج" },
        ].map(t => (
          <button key={t.id} onClick={() => { if (t.id === "list") cancelEdit(); else setTab(t.id); }}
            className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-1.5 ${tab === t.id ? "border-rose text-rose" : "border-transparent text-muted-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        {tab === "list" && (
          <div className="space-y-3">
            {products.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm mb-4">لا توجد منتجات بعد</p>
                <Button onClick={() => setTab("add")} className="rounded-xl gap-2">
                  <Plus className="w-4 h-4" /> أضف منتجك الأول
                </Button>
              </div>
            ) : products.map(p => (
              <div key={p.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.nameAr} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{p.nameAr}</p>
                  <p className="text-xs text-muted-foreground">{Number(p.price).toFixed(3)} د.أ</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {p.isKeto && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">كيتو</span>}
                    {p.isOrganic && <span className="text-[10px] bg-rose/10 text-rose px-1.5 py-0.5 rounded-full">عضوي</span>}
                    {!p.inStock && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">نفد</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => startEdit(p)} className="text-primary p-2 hover:bg-primary/10 rounded-lg">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(p.id, p.nameAr)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "add" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {editingId && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700">تعديل منتج موجود</span>
                <button type="button" onClick={cancelEdit} className="text-amber-700 p-1"><X className="w-4 h-4" /></button>
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الاسم بالعربي *</label>
                  <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} className="h-11 bg-muted border-none text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الاسم بالإنجليزي *</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">وصف بالعربي</label>
                <Textarea value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} className="bg-muted border-none resize-none text-sm min-h-[60px]" />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">السعر (د.أ) *</label>
                  <Input type="number" step="0.001" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">السعر قبل الخصم</label>
                  <Input type="number" step="0.001" value={form.originalPrice} onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">القسم *</label>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full h-11 bg-muted rounded-xl px-3 text-sm border-none outline-none" required>
                    <option value="">اختر القسم</option>
                    {categories?.map(c => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الوزن / الحجم</label>
                  <Input value={form.weightOrVolume} onChange={e => setForm(f => ({ ...f, weightOrVolume: e.target.value }))} className="h-11 bg-muted border-none text-sm" placeholder="500g" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">رابط الصورة</label>
                <Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" placeholder="https://..." />
                {form.imageUrl && <img src={form.imageUrl} alt="" className="h-20 rounded-lg object-cover mt-2" onError={e => (e.currentTarget.style.display = "none")} />}
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground">القيم الغذائية (اختياري)</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: "calories", label: "🔥 السعرات" },
                  { k: "protein", label: "🍗 بروتين (غ)" },
                  { k: "carbs", label: "🌾 كربوهيدرات (غ)" },
                  { k: "fats", label: "🥑 دهون (غ)" },
                ].map(({ k, label }) => (
                  <div key={k} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{label}</label>
                    <Input type="number" step="0.1" value={form[k as keyof typeof form] as string} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "isKeto", label: "كيتو" },
                  { key: "isOrganic", label: "عضوي" },
                  { key: "inStock", label: "متوفر" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 p-3 rounded-xl bg-muted cursor-pointer">
                    <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className="w-4 h-4 accent-rose" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full h-13 rounded-xl text-base font-bold gap-2 bg-rose hover:bg-rose/90">
              {saving ? "جاري الحفظ..." : editingId ? <><Check className="w-5 h-5" /> حفظ التعديلات</> : <><Plus className="w-5 h-5" /> إضافة المنتج</>}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
