import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronRight, Plus, Check, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListCategories, useListProducts } from "@workspace/api-client-react";
import { toast } from "sonner";

const ADMIN_PASSWORD = "tayebat2024";

export default function Admin() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("admin_auth") === "1");
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState<"add" | "list">("add");

  const { data: categories } = useListCategories();
  const { data: products, refetch } = useListProducts({});

  const [form, setForm] = useState({
    nameAr: "", name: "", descriptionAr: "", description: "",
    price: "", originalPrice: "", categoryId: "",
    imageUrl: "", weightOrVolume: "",
    isKeto: false, isOrganic: false, isFeatured: false, isBestseller: false, inStock: true,
  });

  const handleLogin = () => {
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem("admin_auth", "1");
      setAuthed(true);
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr || !form.name || !form.price || !form.categoryId) {
      toast.error("يرجى تعبئة الحقول المطلوبة");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price), originalPrice: form.originalPrice ? Number(form.originalPrice) : null, categoryId: Number(form.categoryId) }),
      });
      if (!res.ok) throw new Error();
      setSuccess(true);
      toast.success("تم إضافة المنتج بنجاح");
      setForm({ nameAr: "", name: "", descriptionAr: "", description: "", price: "", originalPrice: "", categoryId: "", imageUrl: "", weightOrVolume: "", isKeto: false, isOrganic: false, isFeatured: false, isBestseller: false, inStock: true });
      refetch();
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      toast.error("حدث خطأ أثناء إضافة المنتج");
    }
    setSaving(false);
  };

  const handleDelete = async (id: number, nameAr: string) => {
    if (!confirm(`هل تريد حذف "${nameAr}"؟`)) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("تم الحذف"); refetch(); }
    else toast.error("فشل الحذف");
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold">لوحة التحكم</h1>
            <p className="text-muted-foreground text-sm mt-1">أدخل كلمة مرور المشرف</p>
          </div>
          <div className="space-y-3">
            <Input type="password" placeholder="كلمة المرور" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} className="h-12 bg-muted border-none" dir="ltr" />
            <Button className="w-full h-12 rounded-xl" onClick={handleLogin}>دخول</Button>
          </div>
          <button onClick={() => setLocation("/")} className="mt-4 w-full text-center text-sm text-muted-foreground">العودة للمتجر</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8 min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground pt-10 pb-4 px-4 flex items-center gap-3 rounded-b-2xl">
        <Link href="/"><div className="p-1.5 -mr-1 cursor-pointer"><ChevronRight className="w-5 h-5" /></div></Link>
        <h1 className="text-lg font-bold flex-1">إدارة المنتجات</h1>
        <button onClick={() => { sessionStorage.removeItem("admin_auth"); setAuthed(false); }} className="text-xs text-primary-foreground/70 hover:text-primary-foreground">خروج</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background sticky top-0 z-10">
        {[{ id: "add", label: "إضافة منتج" }, { id: "list", label: "قائمة المنتجات" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as "add" | "list")}
            className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${tab === t.id ? "border-rose text-rose" : "border-transparent text-muted-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        {tab === "add" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground mb-2">معلومات المنتج</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الاسم بالعربي *</label>
                  <Input placeholder="مثال: زيت زيتون بكر" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} className="h-11 bg-muted border-none text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الاسم بالإنجليزي *</label>
                  <Input placeholder="Extra Virgin Olive Oil" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">وصف بالعربي</label>
                <Textarea placeholder="وصف المنتج..." value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} className="bg-muted border-none resize-none text-sm min-h-[80px]" />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground mb-2">السعر والقسم</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">السعر (د.أ) *</label>
                  <Input type="number" step="0.001" placeholder="0.000" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">السعر الأصلي (خصم)</label>
                  <Input type="number" step="0.001" placeholder="اختياري" value={form.originalPrice} onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" />
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
                  <Input placeholder="مثال: 500g" value={form.weightOrVolume} onChange={e => setForm(f => ({ ...f, weightOrVolume: e.target.value }))} className="h-11 bg-muted border-none text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">رابط الصورة</label>
                <Input placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4">
              <h2 className="font-bold text-sm text-muted-foreground mb-3">خصائص المنتج</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "isKeto", label: "كيتو" }, { key: "isOrganic", label: "عضوي" },
                  { key: "isFeatured", label: "مميز" }, { key: "isBestseller", label: "الأكثر مبيعاً" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80">
                    <input type="checkbox" checked={form[key as keyof typeof form] as boolean}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                      className="w-4 h-4 accent-rose" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={saving || success} className={`w-full h-13 rounded-xl text-base font-bold gap-2 ${success ? "bg-green-600 hover:bg-green-600" : "bg-rose hover:bg-rose/90"}`}>
              {success ? <><Check className="w-5 h-5" /> تمت الإضافة</> : saving ? "جاري الحفظ..." : <><Plus className="w-5 h-5" /> إضافة المنتج</>}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{products?.length || 0} منتج في المتجر</p>
            {products?.map(p => (
              <div key={p.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.nameAr} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{p.nameAr}</p>
                  <p className="text-xs text-muted-foreground">{p.categoryNameAr} · {p.price} د.أ</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {p.isKeto && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">كيتو</span>}
                    {p.isOrganic && <span className="text-[10px] bg-rose/10 text-rose px-1.5 py-0.5 rounded-full">عضوي</span>}
                    {!p.inStock && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">نفد</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(p.id, p.nameAr)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg text-xs">حذف</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
