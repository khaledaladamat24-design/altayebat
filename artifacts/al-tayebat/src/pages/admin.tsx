import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronRight, Plus, Check, Package, Users, Store, ShoppingBag, Trash2, Eye, CheckCircle2, XCircle, Clock, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListCategories, useListProducts } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useAuth, useUser } from "@clerk/react";

const ADMIN_PASSWORD = "tayebat2024";
const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";

type Tab = "products-add" | "products-list" | "orders" | "users" | "vendors";

interface AdminOrder {
  id: number; sessionId: string | null; status: string; paymentMethod: string;
  paymentStatus: string; paymentScreenshotUrl: string | null;
  customerName: string | null; customerPhone: string | null;
  subtotal: string; deliveryFee: string; total: string;
  deliveryAddress: string; createdAt: string;
}

interface AdminUser {
  id: number; name: string | null; email: string | null; phone: string | null;
  role: string; isAdmin: boolean; createdAt: string;
}

interface AdminVendor {
  id: number; storeName: string; storeNameAr: string | null; category: string;
  city: string | null; phone: string | null; status: string;
  cliqAlias: string | null; walletNumber: string | null;
  deliveryFeeFixed: string | null; createdAt: string;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const isSuperAdmin = user?.primaryEmailAddress?.emailAddress === SUPER_ADMIN_EMAIL;

  const [authed, setAuthed] = useState(() =>
    sessionStorage.getItem("admin_auth") === "1" || isSuperAdmin
  );
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState<Tab>("products-list");

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);

  const { data: categories } = useListCategories();
  const { data: products, refetch } = useListProducts({});

  const [form, setForm] = useState({
    nameAr: "", name: "", descriptionAr: "", description: "",
    price: "", originalPrice: "", categoryId: "", imageUrl: "", weightOrVolume: "",
    isKeto: false, isOrganic: false, isFeatured: false, isBestseller: false, inStock: true,
  });

  const adminHeaders = { "Content-Type": "application/json", "x-admin-key": ADMIN_PASSWORD };

  useEffect(() => {
    if (authed && (tab === "orders" || tab === "users" || tab === "vendors")) {
      fetchTabData();
    }
  }, [authed, tab]);

  const fetchTabData = async () => {
    setLoadingData(true);
    try {
      if (tab === "orders") {
        const res = await fetch("/api/admin/orders", { headers: adminHeaders });
        setOrders(await res.json());
      } else if (tab === "users") {
        const res = await fetch("/api/admin/users", { headers: adminHeaders });
        setUsers(await res.json());
      } else if (tab === "vendors") {
        const res = await fetch("/api/admin/vendors", { headers: adminHeaders });
        setVendors(await res.json());
      }
    } catch { toast.error("فشل تحميل البيانات"); }
    setLoadingData(false);
  };

  const handleLogin = () => {
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem("admin_auth", "1");
      setAuthed(true);
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr || !form.name || !form.price || !form.categoryId) {
      toast.error("يرجى تعبئة الحقول المطلوبة"); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ ...form, price: Number(form.price), originalPrice: form.originalPrice ? Number(form.originalPrice) : null, categoryId: Number(form.categoryId) }),
      });
      if (!res.ok) throw new Error();
      setSuccess(true);
      toast.success("تم إضافة المنتج بنجاح");
      setForm({ nameAr: "", name: "", descriptionAr: "", description: "", price: "", originalPrice: "", categoryId: "", imageUrl: "", weightOrVolume: "", isKeto: false, isOrganic: false, isFeatured: false, isBestseller: false, inStock: true });
      refetch();
      setTimeout(() => setSuccess(false), 2500);
    } catch { toast.error("حدث خطأ أثناء إضافة المنتج"); }
    setSaving(false);
  };

  const handleDeleteProduct = async (id: number, nameAr: string) => {
    if (!confirm(`هل تريد حذف "${nameAr}"؟`)) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE", headers: adminHeaders });
    if (res.ok) { toast.success("تم الحذف"); refetch(); }
    else toast.error("فشل الحذف");
  };

  const handleUpdateOrderStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ status }) });
    if (res.ok) { toast.success("تم تحديث حالة الطلب"); fetchTabData(); }
  };

  const handleConfirmPayment = async (id: number) => {
    const res = await fetch(`/api/admin/orders/${id}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ paymentStatus: "confirmed" }) });
    if (res.ok) { toast.success("تم تأكيد الدفع"); fetchTabData(); }
  };

  const handleDeleteOrder = async (id: number) => {
    if (!confirm("هل تريد حذف هذا الطلب نهائياً؟")) return;
    const res = await fetch(`/api/admin/orders/${id}`, { method: "DELETE", headers: adminHeaders });
    if (res.ok) { toast.success("تم حذف الطلب"); fetchTabData(); }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("هل تريد حذف هذا المستخدم نهائياً؟")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers: adminHeaders });
    if (res.ok) { toast.success("تم حذف المستخدم"); fetchTabData(); }
  };

  const handleVendorStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/admin/vendors/${id}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ status }) });
    if (res.ok) { toast.success("تم تحديث حالة المورد"); fetchTabData(); }
  };

  const handleDeleteVendor = async (id: number) => {
    if (!confirm("هل تريد حذف هذا المورد نهائياً؟")) return;
    const res = await fetch(`/api/admin/vendors/${id}`, { method: "DELETE", headers: adminHeaders });
    if (res.ok) { toast.success("تم حذف المورد"); fetchTabData(); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "text-amber-600 bg-amber-50 border-amber-200",
      confirmed: "text-green-600 bg-green-50 border-green-200",
      processing: "text-blue-600 bg-blue-50 border-blue-200",
      delivered: "text-green-700 bg-green-100 border-green-300",
      cancelled: "text-red-600 bg-red-50 border-red-200",
      approved: "text-green-600 bg-green-50 border-green-200",
      suspended: "text-red-600 bg-red-50 border-red-200",
    };
    const labels: Record<string, string> = {
      pending: "قيد الانتظار", confirmed: "مؤكد", processing: "قيد التجهيز",
      delivered: "تم التوصيل", cancelled: "ملغي", approved: "مقبول", suspended: "موقوف",
    };
    return <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || "text-muted-foreground bg-muted border-border"}`}>{labels[status] || status}</span>;
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Crown className="w-7 h-7 text-primary" />
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

  const tabs = [
    { id: "products-list", icon: Package, label: "المنتجات" },
    { id: "products-add", icon: Plus, label: "إضافة" },
    { id: "orders", icon: ShoppingBag, label: "الطلبات" },
    { id: "vendors", icon: Store, label: "الموردون" },
    { id: "users", icon: Users, label: "المستخدمون" },
  ];

  return (
    <div className="pb-8 min-h-screen bg-muted/30">
      {previewScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewScreenshot(null)}>
          <img src={previewScreenshot} alt="إيصال الدفع" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}

      <div className="bg-primary text-primary-foreground pt-10 pb-4 px-4 flex items-center gap-3 rounded-b-2xl">
        <Link href="/"><div className="p-1.5 -mr-1 cursor-pointer"><ChevronRight className="w-5 h-5" /></div></Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold">لوحة التحكم</h1>
          {isSuperAdmin && <p className="text-xs text-primary-foreground/70 flex items-center gap-1"><Crown className="w-3 h-3" /> Super Admin — صلاحية مطلقة</p>}
        </div>
        <button onClick={() => { sessionStorage.removeItem("admin_auth"); setAuthed(false); }} className="text-xs text-primary-foreground/70 hover:text-primary-foreground">خروج</button>
      </div>

      <div className="flex border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className={`flex-1 min-w-[64px] py-3 text-xs font-bold transition-colors border-b-2 flex flex-col items-center gap-0.5 ${tab === t.id ? "border-rose text-rose" : "border-transparent text-muted-foreground"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        {/* ── Products List ── */}
        {tab === "products-list" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{products?.length || 0} منتج في المتجر</p>
            {products?.map(p => (
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
                  <p className="text-xs text-muted-foreground">{p.categoryNameAr} · {p.price} د.أ</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {p.isKeto && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">كيتو</span>}
                    {p.isOrganic && <span className="text-[10px] bg-rose/10 text-rose px-1.5 py-0.5 rounded-full">عضوي</span>}
                    {!p.inStock && <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">نفد</span>}
                  </div>
                </div>
                <button onClick={() => handleDeleteProduct(p.id, p.nameAr)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Add Product ── */}
        {tab === "products-add" && (
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground mb-2">معلومات المنتج</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الاسم بالعربي *</label>
                  <Input placeholder="زيت زيتون بكر" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} className="h-11 bg-muted border-none text-sm" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">الاسم بالإنجليزي *</label>
                  <Input placeholder="Olive Oil" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">وصف بالعربي</label>
                <Textarea placeholder="وصف المنتج..." value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} className="bg-muted border-none resize-none text-sm min-h-[70px]" />
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
                  <label className="text-xs font-medium text-muted-foreground">السعر الأصلي</label>
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
                <label className="text-xs font-medium text-muted-foreground">رابط الصورة (URL)</label>
                <Input placeholder="https://images.unsplash.com/..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="h-11 bg-muted border-none text-sm" dir="ltr" />
                {form.imageUrl && <img src={form.imageUrl} alt="preview" className="h-20 rounded-lg object-cover" onError={e => (e.currentTarget.style.display = "none")} />}
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4">
              <h2 className="font-bold text-sm text-muted-foreground mb-3">خصائص المنتج</h2>
              <div className="grid grid-cols-2 gap-2">
                {[{ key: "isKeto", label: "كيتو" }, { key: "isOrganic", label: "عضوي" }, { key: "isFeatured", label: "مميز" }, { key: "isBestseller", label: "الأكثر مبيعاً" }].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80">
                    <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className="w-4 h-4 accent-rose" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={saving || success} className={`w-full h-13 rounded-xl text-base font-bold gap-2 ${success ? "bg-green-600 hover:bg-green-600" : "bg-rose hover:bg-rose/90"}`}>
              {success ? <><Check className="w-5 h-5" /> تمت الإضافة</> : saving ? "جاري الحفظ..." : <><Plus className="w-5 h-5" /> إضافة المنتج</>}
            </Button>
          </form>
        )}

        {/* ── Orders ── */}
        {tab === "orders" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{orders.length} طلب إجمالي</p>
              <button onClick={fetchTabData} className="text-xs text-primary font-bold">تحديث</button>
            </div>
            {loadingData ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">لا توجد طلبات بعد</div>
            ) : orders.map(order => (
              <div key={order.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-black text-sm">طلب #{order.id}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{order.customerName} · {order.customerPhone}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {statusBadge(order.status)}
                    {statusBadge(order.paymentStatus === "confirmed" ? "confirmed" : order.paymentMethod === "cod" ? "pending" : order.paymentStatus)}
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الإجمالي</span>
                  <span className="font-bold">{Number(order.total).toFixed(3)} د.أ</span>
                </div>
                {order.paymentScreenshotUrl && (
                  <button onClick={() => setPreviewScreenshot(order.paymentScreenshotUrl)}
                    className="w-full flex items-center gap-2 bg-muted/50 rounded-xl p-2.5 text-sm font-medium text-primary hover:bg-muted transition-colors">
                    <Eye className="w-4 h-4" /> عرض إيصال الدفع
                  </button>
                )}
                <div className="flex gap-2 flex-wrap">
                  {order.status === "pending" && (
                    <button onClick={() => handleUpdateOrderStatus(order.id, "processing")}
                      className="flex-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-xl py-2 font-bold">قيد التجهيز</button>
                  )}
                  {order.status === "processing" && (
                    <button onClick={() => handleUpdateOrderStatus(order.id, "delivered")}
                      className="flex-1 text-xs bg-green-50 text-green-600 border border-green-200 rounded-xl py-2 font-bold">تم التوصيل</button>
                  )}
                  {order.paymentScreenshotUrl && order.paymentStatus !== "confirmed" && (
                    <button onClick={() => handleConfirmPayment(order.id)}
                      className="flex-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-xl py-2 font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> تأكيد الدفع
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button onClick={() => handleDeleteOrder(order.id)}
                      className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-3 py-2">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Vendors ── */}
        {tab === "vendors" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{vendors.length} مورد مسجل</p>
              <button onClick={fetchTabData} className="text-xs text-primary font-bold">تحديث</button>
            </div>
            {loadingData ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : vendors.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">لا يوجد موردون بعد</div>
            ) : vendors.map(vendor => (
              <div key={vendor.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black text-sm">{vendor.storeNameAr || vendor.storeName}</p>
                    <p className="text-xs text-muted-foreground">{vendor.city} · {vendor.phone}</p>
                    <p className="text-xs text-muted-foreground">كليك: {vendor.cliqAlias || "—"}</p>
                  </div>
                  {statusBadge(vendor.status)}
                </div>
                <div className="flex gap-2">
                  {vendor.status !== "approved" && (
                    <button onClick={() => handleVendorStatus(vendor.id, "approved")}
                      className="flex-1 text-xs bg-green-50 text-green-600 border border-green-200 rounded-xl py-2 font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> قبول
                    </button>
                  )}
                  {vendor.status !== "suspended" && (
                    <button onClick={() => handleVendorStatus(vendor.id, "suspended")}
                      className="flex-1 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-xl py-2 font-bold flex items-center justify-center gap-1">
                      <XCircle className="w-3 h-3" /> تعليق
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button onClick={() => handleDeleteVendor(vendor.id)}
                      className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-3 py-2">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Users ── */}
        {tab === "users" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{users.length} مستخدم مسجل</p>
              <button onClick={fetchTabData} className="text-xs text-primary font-bold">تحديث</button>
            </div>
            {loadingData ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">لا يوجد مستخدمون بعد</div>
            ) : users.map(u => (
              <div key={u.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black ${u.isAdmin ? "bg-amber-100 text-amber-700" : u.role === "vendor" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {u.isAdmin ? <Crown className="w-5 h-5" /> : u.name?.[0] || "؟"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{u.name || "بدون اسم"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email || u.phone || "بدون معرف"}</p>
                  <div className="flex gap-1 mt-0.5">
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{u.role === "vendor" ? "مورد" : u.role === "admin" ? "مشرف" : "مستهلك"}</span>
                    {u.isAdmin && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Super Admin</span>}
                  </div>
                </div>
                {isSuperAdmin && !u.isAdmin && (
                  <button onClick={() => handleDeleteUser(u.id)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
