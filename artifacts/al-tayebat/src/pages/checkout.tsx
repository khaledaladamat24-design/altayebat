import { useGetCart, useCreateOrder, getGetCartQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { ChevronRight, CheckCircle2, Upload, X, Smartphone, CreditCard, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { MapPicker } from "@/components/map-picker";
import { apiUrl } from "@/lib/api-url";

const formSchema = z.object({
  customerName: z.string().min(2, { message: "الاسم يجب أن يكون حرفين على الأقل" }),
  customerPhone: z.string().min(10, { message: "رقم الهاتف غير صحيح" }),
  deliveryAddress: z.string().min(10, { message: "الرجاء إدخال عنوان واضح للتوصيل" }),
  notes: z.string().optional(),
});

type PaymentMethod = "cod" | "cliq" | "wallet" | "balance";

type VendorPayment = {
  cliqAlias: string | null;
  walletNumber: string | null;
  storeName: string;
};

// Fallback used only when the cart's vendor has not set its payment info yet
const DEFAULT_VENDOR_PAYMENT: VendorPayment = {
  cliqAlias: null,
  walletNumber: null,
  storeName: "الطيبات",
};

export default function Checkout() {
  const [, setLocation] = useLocation();
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState("");
  const [vendorPayment, setVendorPayment] = useState<VendorPayment>(DEFAULT_VENDOR_PAYMENT);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const userId = typeof window !== "undefined" ? localStorage.getItem("al_tayebat_user_id") : null;

  const { data: cart, isLoading } = useGetCart(
    { sessionId },
    { query: { enabled: !!sessionId } }
  );

  const createOrder = useCreateOrder();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: localStorage.getItem("al_tayebat_name") || "",
      customerPhone: localStorage.getItem("al_tayebat_phone") || "",
      deliveryAddress: localStorage.getItem("al_tayebat_address") || "",
      notes: "",
    },
  });

  useEffect(() => {
    if (cart && cart.items.length === 0 && !createOrder.isSuccess) {
      setLocation("/cart");
    }
  }, [cart, setLocation, createOrder.isSuccess]);

  // Look up the vendor's payment details (CliQ alias + wallet number) based on the
  // first product in the cart. We assume a single-vendor cart for now; if items
  // from multiple vendors are mixed in the future, this should be revisited.
  useEffect(() => {
    let cancelled = false;
    const firstProductId = cart?.items?.[0]?.productId;
    if (!firstProductId) return;
    (async () => {
      try {
        const pRes = await fetch(apiUrl(`/api/products/${firstProductId}`));
        if (!pRes.ok) return;
        const product = await pRes.json() as { vendorId?: number | null };
        if (!product.vendorId) return;
        const vRes = await fetch(apiUrl(`/api/vendors/${product.vendorId}`));
        if (!vRes.ok) return;
        const v = await vRes.json() as {
          storeNameAr?: string | null; storeName?: string | null;
          cliqAlias?: string | null; walletNumber?: string | null;
        };
        if (cancelled) return;
        setVendorPayment({
          cliqAlias: v.cliqAlias ?? null,
          walletNumber: v.walletNumber ?? null,
          storeName: v.storeNameAr || v.storeName || "الطيبات",
        });
      } catch {
        // Keep default — checkout still works (COD always available)
      }
    })();
    return () => { cancelled = true; };
  }, [cart]);

  // Load internal wallet balance for signed-in users
  useEffect(() => {
    if (!userId) return;
    fetch(apiUrl(`/api/wallet/${userId}`)).then(async r => {
      if (r.ok) {
        const d = await r.json();
        setWalletBalance(Number(d.balance));
      }
    }).catch(() => {});
  }, [userId]);

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("حجم الصورة يجب أن يكون أقل من 5MB"); return; }
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!sessionId || !cart || cart.items.length === 0) return;

    const total = Number(cart.subtotal) + Number(cart.deliveryFee || 0);

    if (paymentMethod === "cliq" || paymentMethod === "wallet") {
      if (!screenshot) {
        toast.error("يرجى رفع إيصال الدفع لإتمام الطلب");
        // Scroll user straight to the payment/upload section for convenience
        document.getElementById("payment-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    if (paymentMethod === "balance") {
      if (!userId) { toast.error("سجّل دخولك لاستخدام المحفظة"); return; }
      if (walletBalance === null || walletBalance < total) {
        toast.error(`رصيد المحفظة غير كافٍ (${(walletBalance ?? 0).toFixed(2)} د.أ)`);
        return;
      }
    }

    // Final confirmation — orders cannot be cancelled once placed, so make the
    // customer explicitly acknowledge this before we create the order.
    if (!window.confirm("تنبيه: لا يمكن إلغاء الطلب بعد تأكيده. هل تريد المتابعة وتأكيد الطلب؟")) {
      return;
    }

    localStorage.setItem("al_tayebat_name", values.customerName);
    localStorage.setItem("al_tayebat_phone", values.customerPhone);
    localStorage.setItem("al_tayebat_address", values.deliveryAddress);

    createOrder.mutate(
      {
        data: {
          ...values,
          sessionId,
          paymentMethod,
          paymentScreenshotUrl: screenshot || undefined,
        } as Parameters<typeof createOrder.mutate>[0]["data"],
      },
      {
        onSuccess: async (order) => {
          // If paying from internal wallet, deduct balance right after order created
          if (paymentMethod === "balance" && userId) {
            try {
              const res = await fetch(apiUrl(`/api/wallet/${userId}/pay`), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: total, orderId: order.id, description: `دفع طلب #${order.id}` }),
              });
              if (!res.ok) {
                const b = await res.json().catch(() => ({}));
                toast.error(b.error || "فشل خصم الرصيد — تم إنشاء الطلب لكن لم يُخصم الرصيد");
              }
            } catch {
              toast.error("فشل خصم الرصيد من المحفظة");
            }
          }
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
          toast.success("تم تأكيد طلبك بنجاح!");
          setLocation(`/orders/${order.id}`);
        },
        onError: () => {
          toast.error("حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى.");
        },
      }
    );
  };

  if (isLoading || !cart) {
    return <div className="p-8 text-center">جاري التحميل...</div>;
  }

  return (
    <div className="pb-40 min-h-screen bg-muted/30">
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/cart">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">إتمام الطلب</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Step 1 — Delivery Info */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
            بيانات التوصيل
          </h2>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="checkout-form">
              <FormField control={form.control} name="customerName" render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم الكامل</FormLabel>
                  <FormControl>
                    <Input placeholder="مثال: أحمد محمد" className="h-12 bg-muted border-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="customerPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الهاتف</FormLabel>
                  <FormControl>
                    <Input placeholder="0791234567" dir="ltr" className="h-12 bg-muted border-none text-right" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between mb-1">
                    <FormLabel>عنوان التوصيل</FormLabel>
                    <MapPicker onAddressSelect={(address) => {
                      field.onChange(address);
                      localStorage.setItem("al_tayebat_address", address);
                    }} />
                  </div>
                  <FormControl>
                    <Textarea placeholder="المدينة، المنطقة، الشارع، رقم المبنى" className="min-h-[80px] bg-muted border-none resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>ملاحظات إضافية (اختياري)</FormLabel>
                  <FormControl>
                    <Input placeholder="مثال: يرجى الاتصال عند الوصول" className="h-12 bg-muted border-none" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </form>
          </Form>
        </div>

        {/* Step 2 — Payment Method */}
        <div id="payment-section" className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
            طريقة الدفع
          </h2>

          <div className="space-y-3">
            {[
              { id: "cod" as PaymentMethod, icon: CheckCircle2, label: "الدفع عند الاستلام", sub: "ادفع نقداً عند استلام طلبك", disabled: false },
              {
                id: "cliq" as PaymentMethod, icon: Smartphone, label: "تحويل كليك CliQ",
                sub: vendorPayment.cliqAlias ? `معرف كليك: ${vendorPayment.cliqAlias}@` : "المورد لم يفعّل الدفع عبر كليك بعد",
                disabled: !vendorPayment.cliqAlias,
              },
              {
                id: "wallet" as PaymentMethod, icon: Wallet, label: "محفظة إلكترونية",
                sub: vendorPayment.walletNumber ? `رقم المحفظة: ${vendorPayment.walletNumber}` : "المورد لم يفعّل الدفع بالمحفظة بعد",
                disabled: !vendorPayment.walletNumber,
              },
              {
                id: "balance" as PaymentMethod, icon: Wallet, label: "الدفع من رصيد محفظتي",
                sub: !userId
                  ? "سجّل دخولك لاستخدام رصيد محفظتك"
                  : walletBalance === null
                    ? "جاري التحقق من الرصيد..."
                    : `الرصيد المتاح: ${walletBalance.toFixed(2)} د.أ`,
                disabled: !userId || walletBalance === null || walletBalance < (Number(cart.subtotal) + Number(cart.deliveryFee || 0)),
              },
            ].map(opt => (
              <button key={opt.id} type="button" disabled={opt.disabled} onClick={() => !opt.disabled && setPaymentMethod(opt.id)}
                className={`w-full border-2 rounded-xl p-4 flex items-center gap-3 transition-all ${opt.disabled ? "opacity-50 cursor-not-allowed border-border bg-muted/10" : paymentMethod === opt.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${paymentMethod === opt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <opt.icon className="w-5 h-5" />
                </div>
                <div className="text-right flex-1">
                  <p className="font-bold text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{opt.sub}</p>
                </div>
                {paymentMethod === opt.id && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
              </button>
            ))}
          </div>

          {/* Internal wallet info banner */}
          {paymentMethod === "balance" && walletBalance !== null && (
            <div className="mt-4 bg-green-50 dark:bg-green-950/30 rounded-xl p-3 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-400 leading-relaxed">
              ✅ سيُخصم مبلغ الطلب ({(Number(cart.subtotal) + Number(cart.deliveryFee || 0)).toFixed(2)} د.أ) من رصيد محفظتك تلقائياً عند تأكيد الطلب.
            </div>
          )}

          {/* Payment screenshot upload (only for external CliQ / e-wallet) */}
          {(paymentMethod === "cliq" || paymentMethod === "wallet") && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold">
                {paymentMethod === "cliq"
                  ? `حوّل المبلغ إلى كليك: ${vendorPayment.cliqAlias}@ ثم ارفع إيصال الدفع`
                  : `حوّل المبلغ إلى المحفظة: ${vendorPayment.walletNumber} ثم ارفع إيصال الدفع`}
              </p>

              {screenshot ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={screenshot} alt="إيصال الدفع" className="w-full max-h-48 object-cover" />
                  <button type="button" onClick={() => { setScreenshot(null); setScreenshotName(""); }}
                    className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1">
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> تم رفع الإيصال
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-primary/40 rounded-xl py-6 flex flex-col items-center gap-2 hover:bg-primary/5 transition-colors">
                  <Upload className="w-8 h-8 text-primary/60" />
                  <p className="text-sm font-bold text-primary">ارفع إيصال التحويل</p>
                  <p className="text-xs text-muted-foreground">PNG، JPG — حتى 5MB</p>
                </button>
              )}

              <input ref={fileRef} type="file" accept="image/*" onChange={handleScreenshot} className="hidden" />

              {paymentMethod === "cliq" && vendorPayment.cliqAlias && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-400">بيانات كليك للتحويل</p>
                  </div>
                  <p className="text-sm font-black text-blue-800 dark:text-blue-300 mt-1 text-center" dir="ltr">@{vendorPayment.cliqAlias}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 text-center">{vendorPayment.storeName}</p>
                </div>
              )}
              {paymentMethod === "wallet" && vendorPayment.walletNumber && (
                <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl p-3 border border-rose-200 dark:border-rose-800">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-rose-600" />
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400">رقم المحفظة الإلكترونية</p>
                  </div>
                  <p className="text-sm font-black text-rose-800 dark:text-rose-300 mt-1 text-center" dir="ltr">{vendorPayment.walletNumber}</p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 text-center">{vendorPayment.storeName}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3 — Summary */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
            ملخص الطلب
          </h2>

          <div className="space-y-3">
            {cart.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground flex-1 pr-4">{item.quantity} × {item.productNameAr}</span>
                <span className="font-medium whitespace-nowrap">{formatPrice(item.totalPrice)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-border my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="font-medium">{formatPrice(cart.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">رسوم التوصيل</span>
              <span className="font-medium">{cart.deliveryFee === 0 ? "مجاني 🎉" : formatPrice(cart.deliveryFee)}</span>
            </div>
            <div className="border-t border-border mt-3 pt-3" />
            <div className="flex justify-between items-center text-lg font-bold">
              <span>الإجمالي المطلوب</span>
              <span className="text-primary">{formatPrice(cart.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 p-3 bg-background border-t border-border z-40 max-w-md mx-auto">
        <p className="text-[11px] text-muted-foreground text-center mb-2 flex items-center justify-center gap-1">
          <span aria-hidden>⚠️</span> لا يمكن إلغاء الطلب بعد تأكيده
        </p>
        <Button
          type="submit"
          form="checkout-form"
          className="w-full h-13 rounded-full text-base shadow-lg"
          disabled={createOrder.isPending}
        >
          {createOrder.isPending
            ? "جاري التأكيد..."
            : paymentMethod === "cliq"
              ? "ادفع عبر كليك ↙"
              : paymentMethod === "wallet"
                ? "ادفع عبر المحفظة ↙"
                : paymentMethod === "balance"
                  ? `ادفع ${(Number(cart.subtotal) + Number(cart.deliveryFee || 0)).toFixed(2)} د.أ من رصيدي`
                  : "تأكيد الطلب ✓"}
        </Button>
      </div>
    </div>
  );
}
