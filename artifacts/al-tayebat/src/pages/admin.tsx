import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronRight,
  Plus,
  Check,
  Package,
  Users,
  Store,
  ShoppingBag,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Crown,
  Truck,
  Pencil,
  X,
  AlertTriangle,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { UserEditModal } from "@/components/admin/user-edit-modal";
import { VendorEditModal } from "@/components/admin/vendor-edit-modal";
import { VendorAdsModal } from "@/components/admin/vendor-ads-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListCategories, type Product } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useUser } from "@clerk/react";
import { apiUrl, authHeaders } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";

const SUPER_ADMIN_EMAIL = "khaledaladamat24@gmail.com";
const ADMIN_PW_KEY = "al_tayebat_admin_pw";

type Tab = "products-add" | "products-list" | "orders" | "users" | "vendors";

interface AdminOrder {
  id: number;
  sessionId: string | null;
  vendorId: number | null;
  vendorName: string | null;
  vendorNameAr: string | null;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  paymentScreenshotUrl: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: string;
  deliveryFee: string;
  total: string;
  deliveryAddress: string;
  deliveryProviderId: number | null;
  deliveryTrackingNumber: string | null;
  deliveryAwbUrl: string | null;
  deliveryStatus: string | null;
  createdAt: string;
}

interface AdminUser {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  isAdmin: boolean;
  createdAt: string;
}

interface AdminVendor {
  id: number;
  storeName: string;
  storeNameAr: string | null;
  category: string;
  city: string | null;
  phone: string | null;
  status: string;
  cliqAlias: string | null;
  walletNumber: string | null;
  bankAccount: string | null;
  description: string | null;
  deliveryFeeFixed: string | null;
  freeDeliveryAbove: string | null;
  createdAt: string;
}

// Admin product-management row. Shaped like the generated `Product` (so the
// edit form can consume it) plus `vendorStatus` for the grouped dashboard.
type AdminProduct = Product & {
  vendorId: number | null;
  vendorName: string | null;
  vendorNameAr: string | null;
  vendorStatus: string | null;
};

interface VendorSale {
  id: number;
  total: string;
  status: string;
  createdAt: string;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { lang, dir, tr } = useLanguage();

  const isSuperAdmin =
    user?.primaryEmailAddress?.emailAddress === SUPER_ADMIN_EMAIL;

  const [adminKey, setAdminKey] = useState<string>(
    () => sessionStorage.getItem(ADMIN_PW_KEY) || "",
  );
  const [authed, setAuthed] = useState(
    () => !!sessionStorage.getItem(ADMIN_PW_KEY) || isSuperAdmin,
  );
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState<Tab>("products-list");

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [adminProducts, setAdminProducts] = useState<AdminProduct[]>([]);
  const [openVendorKey, setOpenVendorKey] = useState<string | null>(null);
  const [salesDate, setSalesDate] = useState<string>("");
  const [vendorSales, setVendorSales] = useState<VendorSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(
    null,
  );
  // Super-admin edit modals (edit vendor profile, edit user, manage a vendor's ads).
  const [editingVendor, setEditingVendor] = useState<AdminVendor | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [adsVendor, setAdsVendor] = useState<AdminVendor | null>(null);

  // The super-admin identity resolves only after Clerk hydrates, which happens
  // after `authed` is initialized. Grant access as soon as it's known so the
  // owner never hits the password gate for their own account.
  useEffect(() => {
    if (isSuperAdmin) setAuthed(true);
  }, [isSuperAdmin]);

  const { data: categories } = useListCategories();

  // Refresh the grouped product dashboard after add/edit/delete. Reuses the
  // admin endpoints so suspended/offline vendors' products stay visible here.
  const refreshAdminProducts = async () => {
    try {
      const [pRes, vRes] = await Promise.all([
        fetch(apiUrl("/api/admin/products"), { headers: adminHeaders }),
        fetch(apiUrl("/api/admin/vendors"), { headers: adminHeaders }),
      ]);
      if (pRes.ok) setAdminProducts(await pRes.json());
      if (vRes.ok) setVendors(await vRes.json());
    } catch {
      /* non-fatal — the tab refetch will recover on next open */
    }
  };

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
    isFeatured: false,
    isBestseller: false,
    isOnSale: false,
    inStock: true,
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
    foodType: "healthy",
    vendorId: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEditProduct = (p: Product & { vendorId?: number | null }) => {
    setEditingId(p.id);
    setForm({
      nameAr: p.nameAr ?? "",
      name: p.name ?? "",
      descriptionAr: p.descriptionAr ?? "",
      description: p.description ?? "",
      price: p.price != null ? String(p.price) : "",
      originalPrice: p.originalPrice != null ? String(p.originalPrice) : "",
      categoryId: p.categoryId != null ? String(p.categoryId) : "",
      imageUrl: p.imageUrl ?? "",
      weightOrVolume: p.weightOrVolume ?? "",
      isKeto: !!p.isKeto,
      isOrganic: !!p.isOrganic,
      isFeatured: !!p.isFeatured,
      isBestseller: !!p.isBestseller,
      isOnSale: !!p.isOnSale,
      inStock: p.inStock !== false,
      calories: p.calories != null ? String(p.calories) : "",
      protein: p.protein != null ? String(p.protein) : "",
      carbs: p.carbs != null ? String(p.carbs) : "",
      fats: p.fats != null ? String(p.fats) : "",
      foodType:
        p.foodType === "regular" || p.foodType === "grocery"
          ? p.foodType
          : "healthy",
      vendorId: p.vendorId != null ? String(p.vendorId) : "",
    });
    setTab("products-add");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  // The super-admin is verified server-side via the Clerk session cookie (sent
  // automatically), so we no longer send a spoofable x-admin-email header. Other
  // admins authenticate with the admin password (x-admin-key).
  // Merge the caller's identity headers (Clerk bearer / x-clerk-user-id /
  // x-firebase-uid) so the super-admin is resolved server-side even when they
  // entered the panel without typing the admin password (e.g. native, where the
  // Clerk cookie is never sent). The x-admin-key path still works for others.
  const adminHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
    ...(adminKey ? { "x-admin-key": adminKey } : {}),
  };

  useEffect(() => {
    if (
      authed &&
      (tab === "orders" ||
        tab === "users" ||
        tab === "vendors" ||
        tab === "products-list" ||
        tab === "products-add")
    ) {
      fetchTabData();
    }
    // `fetchTabData` reads `tab`/`authed` (already deps) and closes over
    // `adminHeaders`/`tr` which are recreated every render; listing it would
    // refetch on every render. Data should reload only when auth state or the
    // active tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, tab]);

  const fetchTabData = async () => {
    setLoadingData(true);
    try {
      // Defensive: an unauthorized/errored response is an object ({error}), not
      // an array. Coercing to [] keeps the `.map` renders from crashing the
      // whole admin page (the "map is not a function" bug) when a request 403s.
      const readArray = async (res: Response): Promise<unknown[]> => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) {
          if (!res.ok)
            toast.error(tr("فشل تحميل البيانات", "Failed to load data"));
          return [];
        }
        return data;
      };
      if (tab === "orders") {
        const res = await fetch(apiUrl("/api/admin/orders"), {
          headers: adminHeaders,
        });
        setOrders((await readArray(res)) as AdminOrder[]);
      } else if (tab === "users") {
        const res = await fetch(apiUrl("/api/admin/users"), {
          headers: adminHeaders,
        });
        setUsers((await readArray(res)) as typeof users);
      } else if (tab === "vendors") {
        const res = await fetch(apiUrl("/api/admin/vendors"), {
          headers: adminHeaders,
        });
        setVendors((await readArray(res)) as typeof vendors);
      } else if (tab === "products-list") {
        // Grouped product dashboard needs ALL products (incl. suspended/offline
        // vendors) plus the vendor list for names + status badges.
        const [pRes, vRes] = await Promise.all([
          fetch(apiUrl("/api/admin/products"), { headers: adminHeaders }),
          fetch(apiUrl("/api/admin/vendors"), { headers: adminHeaders }),
        ]);
        setAdminProducts((await readArray(pRes)) as typeof adminProducts);
        setVendors((await readArray(vRes)) as typeof vendors);
      } else if (tab === "products-add") {
        // The product form's vendor selector needs the vendor list even when
        // the admin lands on this tab directly (without visiting the list tab).
        const res = await fetch(apiUrl("/api/admin/vendors"), {
          headers: adminHeaders,
        });
        setVendors((await readArray(res)) as typeof vendors);
      }
    } catch {
      toast.error(tr("فشل تحميل البيانات", "Failed to load data"));
    }
    setLoadingData(false);
  };

  // Fetch a vendor's orders for the sales summary panel (super-admin only).
  // Reuses the owner-gated vendor orders route (admin headers bypass ownership).
  // Increments on every sales request so a slow earlier response can never
  // overwrite a newer one when the admin switches vendors/dates quickly.
  const salesReqRef = useRef(0);
  const loadVendorSales = async (vendorId: number, date: string) => {
    const reqId = ++salesReqRef.current;
    setSalesLoading(true);
    setVendorSales([]);
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      const res = await fetch(apiUrl(`/api/vendors/${vendorId}/orders${qs}`), {
        headers: adminHeaders,
      });
      const data = res.ok ? await res.json() : null;
      if (reqId !== salesReqRef.current) return;
      if (data) setVendorSales(data);
    } catch {
      if (reqId !== salesReqRef.current) return;
      toast.error(tr("فشل تحميل المبيعات", "Failed to load sales"));
    }
    if (reqId === salesReqRef.current) setSalesLoading(false);
  };

  // Open/close a vendor group. Opening loads its sales for the chosen day.
  const toggleVendorGroup = (key: string, vendorId: number | null) => {
    if (openVendorKey === key) {
      setOpenVendorKey(null);
      return;
    }
    setOpenVendorKey(key);
    if (vendorId != null) loadVendorSales(vendorId, salesDate);
  };

  const handleLogin = async () => {
    if (!pw) {
      toast.error(tr("أدخل كلمة المرور", "Enter the password"));
      return;
    }
    // Verify against the backend by hitting a protected endpoint with the entered password
    try {
      const res = await fetch(apiUrl("/api/admin/orders"), {
        headers: { "Content-Type": "application/json", "x-admin-key": pw },
      });
      if (res.status === 401 || res.status === 403) {
        toast.error(tr("كلمة المرور غير صحيحة", "Incorrect password"));
        return;
      }
      if (!res.ok) {
        toast.error(
          tr(
            "تعذّر التحقق — حاول مرة أخرى",
            "Verification failed — please try again",
          ),
        );
        return;
      }
      sessionStorage.setItem(ADMIN_PW_KEY, pw);
      setAdminKey(pw);
      setAuthed(true);
      setPw("");
    } catch {
      toast.error(tr("فشل الاتصال بالخادم", "Failed to connect to the server"));
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr || !form.price || !form.categoryId) {
      toast.error(
        tr("يرجى تعبئة الحقول المطلوبة", "Please fill in the required fields"),
      );
      return;
    }
    setSaving(true);
    try {
      const isEdit = editingId != null;
      const res = await fetch(
        apiUrl(
          isEdit ? `/api/admin/products/${editingId}` : "/api/admin/products",
        ),
        {
          method: isEdit ? "PUT" : "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            ...form,
            price: Number(form.price),
            originalPrice: form.originalPrice
              ? Number(form.originalPrice)
              : null,
            categoryId: Number(form.categoryId),
            calories: form.calories || null,
            protein: form.protein || null,
            carbs: form.carbs || null,
            fats: form.fats || null,
            vendorId: form.vendorId ? Number(form.vendorId) : null,
          }),
        },
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
      toast.success(
        isEdit
          ? tr("تم تحديث المنتج", "Product updated")
          : tr("تم إضافة المنتج بنجاح", "Product added successfully"),
      );
      setForm(emptyForm);
      setEditingId(null);
      refreshAdminProducts();
      if (isEdit) setTab("products-list");
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      toast.error(
        editingId != null
          ? tr("فشل تحديث المنتج", "Failed to update product")
          : tr(
              "حدث خطأ أثناء إضافة المنتج",
              "An error occurred while adding the product",
            ),
      );
    }
    setSaving(false);
  };

  const handleDeleteProduct = async (
    id: number,
    nameAr: string,
    nameEn?: string,
  ) => {
    const displayName = lang === "en" ? nameEn || nameAr : nameAr;
    if (
      !confirm(tr(`هل تريد حذف "${displayName}"؟`, `Delete "${displayName}"?`))
    )
      return;
    const res = await fetch(apiUrl(`/api/admin/products/${id}`), {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (res.ok) {
      toast.success(tr("تم الحذف", "Deleted"));
      refreshAdminProducts();
    } else toast.error(tr("فشل الحذف", "Failed to delete"));
  };

  const handleDeleteDemoProducts = async () => {
    if (
      !confirm(
        tr(
          "هل تريد حذف جميع المنتجات التجريبية نهائياً؟",
          "Delete ALL demo products permanently?",
        ),
      )
    )
      return;
    const res = await fetch(apiUrl("/api/admin/products/demo"), {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(
        tr(
          `تم حذف ${data.deleted} منتج تجريبي`,
          `Deleted ${data.deleted} demo products`,
        ),
      );
      refreshAdminProducts();
    } else toast.error(tr("فشل الحذف", "Failed to delete"));
  };

  const handleUpdateOrderStatus = async (id: number, status: string) => {
    const res = await fetch(apiUrl(`/api/admin/orders/${id}`), {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success(tr("تم تحديث حالة الطلب", "Order status updated"));
      fetchTabData();
    } else toast.error(tr("فشل تحديث الحالة", "Failed to update status"));
  };

  const handleConfirmPayment = async (id: number) => {
    const res = await fetch(apiUrl(`/api/admin/orders/${id}`), {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ paymentStatus: "confirmed" }),
    });
    if (res.ok) {
      toast.success(tr("تم تأكيد الدفع", "Payment confirmed"));
      fetchTabData();
    } else toast.error(tr("فشل تأكيد الدفع", "Failed to confirm payment"));
  };

  const handleDeleteOrder = async (id: number) => {
    if (
      !confirm(
        tr("هل تريد حذف هذا الطلب نهائياً؟", "Delete this order permanently?"),
      )
    )
      return;
    const res = await fetch(apiUrl(`/api/admin/orders/${id}`), {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (res.ok) {
      toast.success(tr("تم حذف الطلب", "Order deleted"));
      fetchTabData();
    } else toast.error(tr("فشل حذف الطلب", "Failed to delete order"));
  };

  const handleDeleteUser = async (id: number) => {
    if (
      !confirm(
        tr(
          "هل تريد حذف هذا المستخدم نهائياً؟",
          "Delete this user permanently?",
        ),
      )
    )
      return;
    const res = await fetch(apiUrl(`/api/admin/users/${id}`), {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (res.ok) {
      toast.success(tr("تم حذف المستخدم", "User deleted"));
      fetchTabData();
    } else toast.error(tr("فشل حذف المستخدم", "Failed to delete user"));
  };

  const handleVendorStatus = async (id: number, status: string) => {
    const res = await fetch(apiUrl(`/api/admin/vendors/${id}`), {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success(tr("تم تحديث حالة المورد", "Vendor status updated"));
      fetchTabData();
    } else toast.error(tr("فشل تحديث حالة المورد", "Failed to update vendor"));
  };

  const handleDeleteVendor = async (id: number) => {
    if (
      !confirm(
        tr(
          "هل تريد حذف هذا المورد نهائياً؟",
          "Delete this vendor permanently?",
        ),
      )
    )
      return;
    const res = await fetch(apiUrl(`/api/admin/vendors/${id}`), {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (res.ok) {
      toast.success(tr("تم حذف المورد", "Vendor deleted"));
      fetchTabData();
    } else toast.error(tr("فشل حذف المورد", "Failed to delete vendor"));
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "text-amber-600 bg-amber-50 border-amber-200",
      confirmed: "text-green-600 bg-green-50 border-green-200",
      preparing: "text-blue-600 bg-blue-50 border-blue-200",
      processing: "text-blue-600 bg-blue-50 border-blue-200",
      awaiting_admin: "text-amber-700 bg-amber-100 border-amber-300",
      delivered: "text-green-700 bg-green-100 border-green-300",
      cancelled: "text-red-600 bg-red-50 border-red-200",
      approved: "text-green-600 bg-green-50 border-green-200",
      suspended: "text-red-600 bg-red-50 border-red-200",
    };
    const labels: Record<string, string> = {
      pending: tr("قيد الانتظار", "Pending"),
      confirmed: tr("مؤكد", "Confirmed"),
      preparing: tr("قيد التجهيز", "Preparing"),
      processing: tr("قيد التجهيز", "Preparing"),
      awaiting_admin: tr("بانتظار تدخّل الإدارة", "Needs admin action"),
      delivered: tr("تم التوصيل", "Delivered"),
      cancelled: tr("ملغي", "Cancelled"),
      approved: tr("مقبول", "Approved"),
      suspended: tr("موقوف", "Suspended"),
    };
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || "text-muted-foreground bg-muted border-border"}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  if (!authed) {
    return (
      <div
        dir={dir}
        className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6"
      >
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm shadow-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Crown className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold">
              {tr("لوحة التحكم", "Admin Panel")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {tr("أدخل كلمة مرور المشرف", "Enter the admin password")}
            </p>
          </div>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder={tr("كلمة المرور", "Password")}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="h-12 bg-muted border-none"
              dir="ltr"
            />
            <Button className="w-full h-12 rounded-xl" onClick={handleLogin}>
              {tr("دخول", "Sign in")}
            </Button>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="mt-4 w-full text-center text-sm text-muted-foreground"
          >
            {tr("العودة للمتجر", "Back to store")}
          </button>
        </div>
      </div>
    );
  }

  // Group admin products under each vendor for the grouped dashboard. Vendors
  // are listed even with zero products; null-vendor products fall into a
  // "بدون مورد" group so nothing is hidden.
  const productGroups: {
    key: string;
    vendorId: number | null;
    name: string;
    status: string | null;
    products: AdminProduct[];
  }[] = [
    ...vendors.map((v) => ({
      key: `v-${v.id}`,
      vendorId: v.id,
      name: lang === "en" ? v.storeName : v.storeNameAr || v.storeName,
      status: v.status,
      products: adminProducts.filter((p) => p.vendorId === v.id),
    })),
  ];
  const orphanProducts = adminProducts.filter(
    (p) => p.vendorId == null || !vendors.some((v) => v.id === p.vendorId),
  );
  if (orphanProducts.length > 0) {
    productGroups.push({
      key: "no-vendor",
      vendorId: null,
      name: tr("بدون مورد", "No vendor"),
      status: null,
      products: orphanProducts,
    });
  }

  const tabs = [
    { id: "products-list", icon: Package, label: tr("المنتجات", "Products") },
    {
      id: "products-add",
      icon: editingId != null ? Pencil : Plus,
      label: editingId != null ? tr("تعديل", "Edit") : tr("إضافة", "Add"),
    },
    { id: "orders", icon: ShoppingBag, label: tr("الطلبات", "Orders") },
    { id: "vendors", icon: Store, label: tr("الموردون", "Vendors") },
    { id: "users", icon: Users, label: tr("المستخدمون", "Users") },
    // Shipping-company delivery is frozen — fulfillment is handled per-vendor
    // (delivery/pickup) instead. The delivery tab is hidden from the UI.
  ];

  return (
    <div dir={dir} className="pb-8 min-h-screen bg-muted/30">
      {previewScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewScreenshot(null)}
        >
          <img
            src={previewScreenshot}
            alt={tr("إيصال الدفع", "Payment receipt")}
            className="max-w-full max-h-full rounded-xl"
          />
        </div>
      )}

      <div className="bg-primary text-primary-foreground pt-10 pb-4 px-4 flex items-center gap-3 rounded-b-2xl">
        <Link href="/">
          <div className="p-1.5 -mr-1 cursor-pointer">
            <ChevronRight className="w-5 h-5" />
          </div>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold">
            {tr("لوحة التحكم", "Admin Panel")}
          </h1>
          {isSuperAdmin && (
            <p className="text-xs text-primary-foreground/70 flex items-center gap-1">
              <Crown className="w-3 h-3" />{" "}
              {tr("Super Admin — صلاحية مطلقة", "Super Admin — full access")}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem("admin_auth");
            setAuthed(false);
          }}
          className="text-xs text-primary-foreground/70 hover:text-primary-foreground"
        >
          {tr("خروج", "Sign out")}
        </button>
      </div>

      <div className="flex border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`flex-1 min-w-[64px] py-3 text-xs font-bold transition-colors border-b-2 flex flex-col items-center gap-0.5 ${tab === t.id ? "border-rose text-rose" : "border-transparent text-muted-foreground"}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-5">
        {/* ── Products List ── */}
        {tab === "products-list" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {tr(
                `${vendors.length} مورد · ${adminProducts.length} منتج`,
                `${vendors.length} vendors · ${adminProducts.length} products`,
              )}
            </p>
            {adminProducts.some((p) => p.isDemo) && (
              <button
                onClick={handleDeleteDemoProducts}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded-xl py-2.5 hover:bg-destructive/15"
              >
                <Trash2 className="w-4 h-4" />
                {tr(
                  `حذف المنتجات التجريبية (${adminProducts.filter((p) => p.isDemo).length})`,
                  `Delete demo products (${adminProducts.filter((p) => p.isDemo).length})`,
                )}
              </button>
            )}
            {loadingData && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {tr("جاري التحميل…", "Loading…")}
              </p>
            )}
            {productGroups.map((group) => {
              const isOpen = openVendorKey === group.key;
              const salesTotal = vendorSales
                .filter((o) => o.status !== "cancelled")
                .reduce((sum, o) => sum + Number(o.total || 0), 0);
              const salesCount = vendorSales.filter(
                (o) => o.status !== "cancelled",
              ).length;
              return (
                <div
                  key={group.key}
                  className="bg-card rounded-2xl border border-border overflow-hidden"
                >
                  {/* Vendor header — click to expand its products + sales */}
                  <button
                    onClick={() => toggleVendorGroup(group.key, group.vendorId)}
                    className="w-full flex items-center gap-3 p-3 text-start"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">
                        {group.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tr(
                          `${group.products.length} منتج`,
                          `${group.products.length} products`,
                        )}
                      </p>
                    </div>
                    {group.status && statusBadge(group.status)}
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-border p-3 space-y-3 bg-muted/30">
                      {/* Sales summary by date (vendors only, not the no-vendor group) */}
                      {group.vendorId != null && (
                        <div className="bg-card rounded-xl border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold flex items-center gap-1">
                              <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                              {tr("المبيعات", "Sales")}
                            </p>
                            <input
                              type="date"
                              value={salesDate}
                              onChange={(e) => {
                                setSalesDate(e.target.value);
                                if (group.vendorId != null)
                                  loadVendorSales(
                                    group.vendorId,
                                    e.target.value,
                                  );
                              }}
                              className="text-xs border border-border rounded-lg px-2 py-1 bg-background"
                            />
                          </div>
                          {salesLoading ? (
                            <p className="text-xs text-muted-foreground">
                              {tr("جاري التحميل…", "Loading…")}
                            </p>
                          ) : (
                            <div className="flex gap-4">
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  {tr("عدد الطلبات", "Orders")}
                                </p>
                                <p className="font-black text-sm">
                                  {salesCount}
                                </p>
                              </div>
                              <div>
                                <p className="text-[11px] text-muted-foreground">
                                  {tr("إجمالي المبيعات", "Total sales")}
                                </p>
                                <p className="font-black text-sm text-primary">
                                  {salesTotal.toFixed(2)} {tr("د.أ", "JOD")}
                                </p>
                              </div>
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            {salesDate
                              ? tr(
                                  "طلبات هذا اليوم",
                                  "Orders for the selected day",
                                )
                              : tr(
                                  "طلبات الوردية الحالية",
                                  "Current shift orders",
                                )}
                          </p>
                        </div>
                      )}

                      {/* Products under this vendor */}
                      {group.products.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {tr("لا منتجات", "No products")}
                        </p>
                      ) : (
                        group.products.map((p) => {
                          const displayName =
                            lang === "en" ? p.name || p.nameAr : p.nameAr;
                          const displayCategory =
                            lang === "en"
                              ? p.categoryName || p.categoryNameAr
                              : p.categoryNameAr;
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
                                  {displayCategory} · {p.price}{" "}
                                  {tr("د.أ", "JOD")}
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
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => startEditProduct(p)}
                                  className="text-primary p-2 hover:bg-primary/10 rounded-lg"
                                  title={tr("تعديل", "Edit")}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteProduct(p.id, p.nameAr, p.name)
                                  }
                                  className="text-destructive p-2 hover:bg-destructive/10 rounded-lg"
                                  title={tr("حذف", "Delete")}
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
                </div>
              );
            })}
            {!loadingData && productGroups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {tr("لا يوجد موردون بعد", "No vendors yet")}
              </p>
            )}
          </div>
        )}

        {/* ── Add Product ── */}
        {tab === "products-add" && (
          <form onSubmit={handleAddProduct} className="space-y-4">
            {editingId != null && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-amber-700" />
                  <span className="text-sm font-bold text-amber-800">
                    {tr(
                      `وضع التعديل — منتج #${editingId}`,
                      `Edit mode — product #${editingId}`,
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-amber-300"
                >
                  <X className="w-3 h-3" /> {tr("إلغاء", "Cancel")}
                </button>
              </div>
            )}
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground mb-2">
                {tr("معلومات المنتج", "Product information")}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("الاسم بالعربي *", "Arabic name *")}
                  </label>
                  <Input
                    placeholder={tr("زيت زيتون بكر", "زيت زيتون بكر")}
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
                    {tr(
                      "الاسم بالإنجليزي (اختياري)",
                      "English name (optional)",
                    )}
                  </label>
                  <Input
                    placeholder="Olive Oil"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("وصف بالعربي", "Arabic description")}
                </label>
                <Textarea
                  placeholder={tr("وصف المنتج...", "وصف المنتج...")}
                  value={form.descriptionAr}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descriptionAr: e.target.value }))
                  }
                  className="bg-muted border-none resize-none text-sm min-h-[70px]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("وصف بالإنجليزي", "English description")}
                </label>
                <Textarea
                  placeholder="Product description..."
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="bg-muted border-none resize-none text-sm min-h-[70px]"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <h2 className="font-bold text-sm text-muted-foreground mb-2">
                {tr("السعر والقسم", "Price & category")}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {tr("السعر (د.أ) *", "Price (JOD) *")}
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
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
                    {tr("السعر الأصلي", "Original price")}
                  </label>
                  <Input
                    type="number"
                    step="0.001"
                    placeholder={tr("اختياري", "Optional")}
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
                      {tr("اختر الصنف", "Choose category")}
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
                  {tr("المورّد (المتجر)", "Vendor (store)")}
                </label>
                <select
                  value={form.vendorId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vendorId: e.target.value }))
                  }
                  className="w-full h-11 bg-muted rounded-xl px-3 text-sm border-none outline-none"
                >
                  <option value="">{tr("بدون مورد", "No vendor")}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {lang === "en"
                        ? v.storeName
                        : v.storeNameAr || v.storeName}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {tr(
                    "سيظهر المنتج في متجر هذا المورّد كأنك أضفته باسمه",
                    "The product will appear in this vendor's store",
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {tr("الوزن / الحجم", "Weight / Volume")}
                </label>
                <Input
                  placeholder={tr("مثال: 500g", "e.g. 500g")}
                  value={form.weightOrVolume}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weightOrVolume: e.target.value }))
                  }
                  className="h-11 bg-muted border-none text-sm"
                />
              </div>
              <div className="space-y-1">
                <ImageUpload
                  value={form.imageUrl}
                  onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
                />
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-sm text-muted-foreground">
                  {tr("القيم الغذائية (اختياري)", "Nutrition facts (optional)")}
                </h2>
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                  {tr("اختياري", "Optional")}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                {tr(
                  "اتركها فارغة لإخفائها من بطاقة المنتج",
                  "Leave empty to hide from the product card",
                )}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    🔥 {tr("السعرات (kcal)", "Calories (kcal)")}
                  </label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder={tr("مثال: 450", "e.g. 450")}
                    value={form.calories}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, calories: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    🍗 {tr("بروتين (غ)", "Protein (g)")}
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder={tr("مثال: 35", "e.g. 35")}
                    value={form.protein}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, protein: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    🌾 {tr("كربوهيدرات (غ)", "Carbs (g)")}
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder={tr("مثال: 20", "e.g. 20")}
                    value={form.carbs}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, carbs: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    🥑 {tr("دهون (غ)", "Fats (g)")}
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder={tr("مثال: 12", "e.g. 12")}
                    value={form.fats}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fats: e.target.value }))
                    }
                    className="h-11 bg-muted border-none text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4">
              <h2 className="font-bold text-sm text-muted-foreground mb-3">
                {tr("خصائص المنتج", "Product attributes")}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "isKeto", label: tr("كيتو", "Keto") },
                  { key: "isOrganic", label: tr("عضوي", "Organic") },
                  { key: "isFeatured", label: tr("مميز", "Featured") },
                  {
                    key: "isBestseller",
                    label: tr("الأكثر مبيعاً", "Bestseller"),
                  },
                  {
                    key: "isOnSale",
                    label: tr("عرض / تخفيض", "On sale / Discount"),
                  },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 p-3 rounded-xl bg-muted cursor-pointer hover:bg-muted/80"
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
              disabled={saving || success}
              className={`w-full h-13 rounded-xl text-base font-bold gap-2 ${success ? "bg-green-600 hover:bg-green-600" : "bg-rose hover:bg-rose/90"}`}
            >
              {success ? (
                <>
                  <Check className="w-5 h-5" />{" "}
                  {editingId != null
                    ? tr("تم التحديث", "Updated")
                    : tr("تمت الإضافة", "Added")}
                </>
              ) : saving ? (
                tr("جاري الحفظ...", "Saving...")
              ) : editingId != null ? (
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

        {/* ── Orders ── */}
        {tab === "orders" && (
          <div className="space-y-3">
            {(() => {
              const vendorMap = new Map<number, string>();
              for (const o of orders) {
                if (o.vendorId != null && !vendorMap.has(o.vendorId)) {
                  vendorMap.set(
                    o.vendorId,
                    o.vendorNameAr || o.vendorName || `#${o.vendorId}`,
                  );
                }
              }
              const vendorChoices = Array.from(vendorMap.entries());
              const filteredOrders =
                selectedVendorId === ""
                  ? orders
                  : orders.filter(
                      (o) => String(o.vendorId ?? "") === selectedVendorId,
                    );
              return (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={selectedVendorId}
                      onChange={(e) => setSelectedVendorId(e.target.value)}
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="select-vendor-filter"
                    >
                      <option value="">
                        {tr("كل المطاعم", "All vendors")}
                      </option>
                      {vendorChoices.map(([id, name]) => (
                        <option key={id} value={String(id)}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={fetchTabData}
                      className="text-xs text-primary font-bold shrink-0"
                    >
                      {tr("تحديث", "Refresh")}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      `${filteredOrders.length} طلب`,
                      `${filteredOrders.length} orders`,
                    )}
                  </p>
                  {(() => {
                    const needsAction = filteredOrders.filter(
                      (o) => o.status === "awaiting_admin",
                    ).length;
                    if (needsAction === 0) return null;
                    return (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-3 text-sm font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {tr(
                          `${needsAction} طلب بحاجة تدخّل الإدارة (المطعم لم يردّ ودفع الزبون مسبقاً)`,
                          `${needsAction} order(s) need admin action (vendor unresponsive, customer prepaid)`,
                        )}
                      </div>
                    );
                  })()}
                  {loadingData ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {tr("جاري التحميل...", "Loading...")}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      {tr("لا توجد طلبات بعد", "No orders yet")}
                    </div>
                  ) : (
                    filteredOrders.map((order) => (
                      <div
                        key={order.id}
                        className="bg-card rounded-xl border border-border p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-sm">
                              {tr(`طلب #${order.id}`, `Order #${order.id}`)}
                            </span>
                            {(order.vendorNameAr || order.vendorName) && (
                              <p className="text-xs font-bold text-primary mt-0.5">
                                {order.vendorNameAr || order.vendorName}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {order.customerName} · {order.customerPhone}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {statusBadge(order.status)}
                            {statusBadge(
                              order.paymentStatus === "confirmed"
                                ? "confirmed"
                                : order.paymentMethod === "cod"
                                  ? "pending"
                                  : order.paymentStatus,
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {tr("الإجمالي", "Total")}
                          </span>
                          <span className="font-bold">
                            {Number(order.total).toFixed(3)} {tr("د.أ", "JOD")}
                          </span>
                        </div>
                        {order.paymentScreenshotUrl && (
                          <button
                            onClick={() =>
                              setPreviewScreenshot(order.paymentScreenshotUrl)
                            }
                            className="w-full flex items-center gap-2 bg-muted/50 rounded-xl p-2.5 text-sm font-medium text-primary hover:bg-muted transition-colors"
                          >
                            <Eye className="w-4 h-4" />{" "}
                            {tr("عرض إيصال الدفع", "View payment receipt")}
                          </button>
                        )}
                        {order.deliveryTrackingNumber && (
                          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 text-sm text-indigo-700">
                            <Truck className="w-4 h-4 shrink-0" />
                            <span className="font-medium">
                              {tr("رقم التتبع", "Tracking")}:
                            </span>
                            <span className="font-bold break-all">
                              {order.deliveryTrackingNumber}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          {order.status === "pending" && (
                            <button
                              onClick={() =>
                                handleUpdateOrderStatus(order.id, "preparing")
                              }
                              className="flex-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-xl py-2 font-bold"
                            >
                              {tr("قيد التجهيز", "Preparing")}
                            </button>
                          )}
                          {(order.status === "preparing" ||
                            order.status === "processing") && (
                            <button
                              onClick={() =>
                                handleUpdateOrderStatus(order.id, "delivered")
                              }
                              className="flex-1 text-xs bg-green-50 text-green-600 border border-green-200 rounded-xl py-2 font-bold"
                            >
                              {tr("تم التوصيل", "Delivered")}
                            </button>
                          )}
                          {order.status === "awaiting_admin" && (
                            <>
                              <button
                                onClick={() =>
                                  handleUpdateOrderStatus(order.id, "preparing")
                                }
                                className="flex-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-xl py-2 font-bold"
                              >
                                {tr("قبول الطلب", "Accept order")}
                              </button>
                              <button
                                onClick={() =>
                                  handleUpdateOrderStatus(order.id, "cancelled")
                                }
                                className="flex-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-xl py-2 font-bold"
                              >
                                {tr("إلغاء الطلب", "Cancel order")}
                              </button>
                            </>
                          )}
                          {order.paymentScreenshotUrl &&
                            order.paymentStatus !== "confirmed" && (
                              <button
                                onClick={() => handleConfirmPayment(order.id)}
                                className="flex-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-xl py-2 font-bold flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />{" "}
                                {tr("تأكيد الدفع", "Confirm payment")}
                              </button>
                            )}
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-3 py-2"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ── Vendors ── */}
        {tab === "vendors" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {tr(
                  `${vendors.length} مورد مسجل`,
                  `${vendors.length} registered vendors`,
                )}
              </p>
              <button
                onClick={fetchTabData}
                className="text-xs text-primary font-bold"
              >
                {tr("تحديث", "Refresh")}
              </button>
            </div>
            {loadingData ? (
              <div className="text-center py-8 text-muted-foreground">
                {tr("جاري التحميل...", "Loading...")}
              </div>
            ) : vendors.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {tr("لا يوجد موردون بعد", "No vendors yet")}
              </div>
            ) : (
              vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="bg-card rounded-xl border border-border p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-sm">
                        {lang === "en"
                          ? vendor.storeName || vendor.storeNameAr
                          : vendor.storeNameAr || vendor.storeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {vendor.city} · {vendor.phone}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tr("كليك", "CliQ")}: {vendor.cliqAlias || "—"}
                      </p>
                    </div>
                    {statusBadge(vendor.status)}
                  </div>
                  <div className="flex gap-2">
                    {vendor.status !== "approved" && (
                      <button
                        onClick={() =>
                          handleVendorStatus(vendor.id, "approved")
                        }
                        className="flex-1 text-xs bg-green-50 text-green-600 border border-green-200 rounded-xl py-2 font-bold flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />{" "}
                        {tr("قبول", "Approve")}
                      </button>
                    )}
                    {vendor.status !== "suspended" && (
                      <button
                        onClick={() =>
                          handleVendorStatus(vendor.id, "suspended")
                        }
                        className="flex-1 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-xl py-2 font-bold flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> {tr("تعليق", "Suspend")}
                      </button>
                    )}
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={() => setEditingVendor(vendor)}
                          className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-xl px-3 py-2"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setAdsVendor(vendor)}
                          className="text-xs bg-rose-50 text-rose-600 border border-rose-200 rounded-xl px-3 py-2 font-bold"
                        >
                          {tr("إعلانات", "Ads")}
                        </button>
                      </>
                    )}
                    {authed && (
                      <button
                        onClick={() => handleDeleteVendor(vendor.id)}
                        className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-xl px-3 py-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Users ── */}
        {tab === "users" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {tr(
                  `${users.length} مستخدم مسجل`,
                  `${users.length} registered users`,
                )}
              </p>
              <button
                onClick={fetchTabData}
                className="text-xs text-primary font-bold"
              >
                {tr("تحديث", "Refresh")}
              </button>
            </div>
            {loadingData ? (
              <div className="text-center py-8 text-muted-foreground">
                {tr("جاري التحميل...", "Loading...")}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {tr("لا يوجد مستخدمون بعد", "No users yet")}
              </div>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black ${u.isAdmin ? "bg-amber-100 text-amber-700" : u.role === "vendor" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    {u.isAdmin ? (
                      <Crown className="w-5 h-5" />
                    ) : (
                      u.name?.[0] || (lang === "en" ? "?" : "؟")
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {u.name || tr("بدون اسم", "No name")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email || u.phone || tr("بدون معرف", "No identifier")}
                    </p>
                    <div className="flex gap-1 mt-0.5">
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                        {u.role === "vendor"
                          ? tr("مورد", "Vendor")
                          : u.role === "admin"
                            ? tr("مشرف", "Admin")
                            : tr("مستهلك", "Customer")}
                      </span>
                      {u.isAdmin && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                          Super Admin
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isSuperAdmin && !u.isAdmin && (
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-primary p-2 hover:bg-primary/10 rounded-lg"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {authed && !u.isAdmin && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="text-destructive p-2 hover:bg-destructive/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {editingVendor && (
        <VendorEditModal
          vendor={editingVendor}
          adminHeaders={adminHeaders}
          onClose={() => setEditingVendor(null)}
          onSaved={fetchTabData}
        />
      )}
      {adsVendor && (
        <VendorAdsModal
          vendorId={adsVendor.id}
          vendorName={adsVendor.storeNameAr || adsVendor.storeName}
          adminHeaders={adminHeaders}
          onClose={() => setAdsVendor(null)}
        />
      )}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          adminHeaders={adminHeaders}
          onClose={() => setEditingUser(null)}
          onSaved={fetchTabData}
        />
      )}
    </div>
  );
}
