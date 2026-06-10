import {
  useGetCart,
  useCreateOrder,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import {
  ChevronRight,
  CheckCircle2,
  Upload,
  X,
  Smartphone,
  CreditCard,
  Wallet,
  Landmark,
  Bike,
  PackageCheck,
} from "lucide-react";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPicker } from "@/components/map-picker";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";
import { setReturnTo } from "@/lib/post-auth";

type PaymentMethod = "cod" | "cliq" | "iban" | "ewallet";
type FulfillmentType = "delivery" | "pickup";

// Manual-transfer methods require the customer to send money out-of-band and
// upload a receipt; COD is settled on delivery.
const MANUAL_METHODS: PaymentMethod[] = ["cliq", "iban", "ewallet"];

type VendorPayment = {
  cliqAlias: string | null;
  bankAccount: string | null;
  walletNumber: string | null;
  storeName: string;
};

export default function Checkout() {
  const [, setLocation] = useLocation();
  const sessionId = useSession();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { lang, dir, tr } = useLanguage();

  // delivery (to address) vs pickup (collect from the store, no delivery fee).
  const [fulfillmentType, setFulfillmentType] =
    useState<FulfillmentType>("delivery");
  // What the cart's vendor allows. Defaults to both until we look it up.
  const [vendorFulfillment, setVendorFulfillment] = useState<{
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
  }>({ pickupEnabled: true, deliveryEnabled: true });

  const formSchema = useMemo(
    () =>
      z.object({
        customerName: z.string().min(2, {
          message: tr(
            "الاسم يجب أن يكون حرفين على الأقل",
            "Name must be at least 2 characters",
          ),
        }),
        customerPhone: z.string().min(10, {
          message: tr("رقم الهاتف غير صحيح", "Invalid phone number"),
        }),
        // Address is only required for delivery; pickup collects from the store.
        deliveryAddress:
          fulfillmentType === "pickup"
            ? z.string().optional()
            : z.string().min(10, {
                message: tr(
                  "الرجاء إدخال عنوان واضح للتوصيل",
                  "Please enter a clear delivery address",
                ),
              }),
        notes: z.string().optional(),
      }),
    [tr, fulfillmentType],
  );

  // Fallback used only when the cart's vendor has not set its payment info yet
  const DEFAULT_VENDOR_PAYMENT: VendorPayment = {
    cliqAlias: null,
    bankAccount: null,
    walletNumber: null,
    storeName: tr("الطيبات", "Al-Tayebat"),
  };

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [_screenshotName, setScreenshotName] = useState("");
  const [vendorPayment, setVendorPayment] = useState<VendorPayment>(
    DEFAULT_VENDOR_PAYMENT,
  );
  // Track whether the async vendor lookup has finished, so we only downgrade an
  // invalid payment method once we actually know the vendor's options.
  const [vendorChecked, setVendorChecked] = useState(false);
  const { data: cart, isLoading } = useGetCart(
    { sessionId },
    {
      query: {
        enabled: !!sessionId,
        queryKey: getGetCartQueryKey({ sessionId }),
      },
    },
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
        const product = (await pRes.json()) as { vendorId?: number | null };
        if (!product.vendorId) return;
        const vRes = await fetch(apiUrl(`/api/vendors/${product.vendorId}`));
        if (!vRes.ok) return;
        const v = (await vRes.json()) as {
          storeNameAr?: string | null;
          storeName?: string | null;
          cliqAlias?: string | null;
          bankAccount?: string | null;
          walletNumber?: string | null;
          pickupEnabled?: boolean;
          deliveryEnabled?: boolean;
        };
        if (cancelled) return;
        setVendorPayment({
          cliqAlias: v.cliqAlias ?? null,
          bankAccount: v.bankAccount ?? null,
          walletNumber: v.walletNumber ?? null,
          storeName:
            (lang === "en"
              ? v.storeName || v.storeNameAr
              : v.storeNameAr || v.storeName) || tr("الطيبات", "Al-Tayebat"),
        });
        const pickupEnabled = v.pickupEnabled !== false;
        const deliveryEnabled = v.deliveryEnabled !== false;
        setVendorFulfillment({ pickupEnabled, deliveryEnabled });
        // If the vendor only offers pickup, switch the customer to it so they
        // never sit on a delivery option the store can't fulfil.
        if (!deliveryEnabled && pickupEnabled) {
          setFulfillmentType("pickup");
        } else if (deliveryEnabled && !pickupEnabled) {
          setFulfillmentType("delivery");
        }
      } catch {
        // Keep default — checkout still works (COD always available)
      } finally {
        if (!cancelled) setVendorChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, lang, tr]);

  // If the selected manual-transfer method turns out to be unavailable (the
  // vendor hasn't provided that payment detail), fall back to COD so the user
  // never lands on a selected-but-disabled payment option.
  useEffect(() => {
    if (paymentMethod === "cod" || !cart || !vendorChecked) return;
    const available =
      (paymentMethod === "cliq" && !!vendorPayment.cliqAlias) ||
      (paymentMethod === "iban" && !!vendorPayment.bankAccount) ||
      (paymentMethod === "ewallet" && !!vendorPayment.walletNumber);
    if (!available) {
      setPaymentMethod("cod");
    }
  }, [paymentMethod, vendorChecked, vendorPayment, cart]);

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        tr(
          "حجم الصورة يجب أن يكون أقل من 5MB",
          "Image size must be less than 5MB",
        ),
      );
      return;
    }
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!sessionId || !cart || cart.items.length === 0) return;

    const pickup = fulfillmentType === "pickup";

    // Manual-transfer methods (CliQ/IBAN/e-wallet) require a payment receipt.
    if (MANUAL_METHODS.includes(paymentMethod) && !screenshot) {
      toast.error(
        tr(
          "يرجى رفع إيصال الدفع لإتمام الطلب",
          "Please upload the payment receipt to complete your order",
        ),
      );
      // Scroll user straight to the payment/upload section for convenience
      document
        .getElementById("payment-section")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Final confirmation — orders cannot be cancelled once placed, so make the
    // customer explicitly acknowledge this before we create the order.
    if (
      !window.confirm(
        tr(
          "تنبيه: لا يمكن إلغاء الطلب بعد تأكيده. هل تريد المتابعة وتأكيد الطلب؟",
          "Notice: Orders cannot be cancelled after confirmation. Do you want to continue and confirm the order?",
        ),
      )
    ) {
      return;
    }

    localStorage.setItem("al_tayebat_name", values.customerName);
    localStorage.setItem("al_tayebat_phone", values.customerPhone);
    if (values.deliveryAddress) {
      localStorage.setItem("al_tayebat_address", values.deliveryAddress);
    }

    createOrder.mutate(
      {
        data: {
          ...values,
          sessionId,
          paymentMethod,
          fulfillmentType,
          deliveryAddress: pickup
            ? tr("استلام من المتجر", "Pickup from store")
            : values.deliveryAddress,
          paymentScreenshotUrl: screenshot || undefined,
        } as Parameters<typeof createOrder.mutate>[0]["data"],
      },
      {
        onSuccess: (order) => {
          queryClient.invalidateQueries({
            queryKey: getGetCartQueryKey({ sessionId }),
          });
          toast.success(
            tr("تم تأكيد طلبك بنجاح!", "Your order has been confirmed!"),
          );
          setLocation(`/orders/${order.id}`);
        },
        onError: (err) => {
          const apiErr = err as {
            data?: { error?: string; code?: string };
          };
          // Anti-fraud gate: the customer's phone isn't registered yet. Stash
          // the half-filled form and send them to create an account, then they
          // return to /checkout (cart preserved via sessionId) to finish.
          if (apiErr?.data?.code === "PHONE_NOT_REGISTERED") {
            const values = form.getValues();
            if (values.customerName)
              localStorage.setItem("al_tayebat_name", values.customerName);
            if (values.customerPhone)
              localStorage.setItem("al_tayebat_phone", values.customerPhone);
            if (values.deliveryAddress)
              localStorage.setItem(
                "al_tayebat_address",
                values.deliveryAddress,
              );
            setReturnTo("/checkout");
            toast.error(
              tr(
                "يجب التسجيل برقم هاتفك أولاً لإتمام الطلب. سننقلك لإنشاء حساب.",
                "You must register with your phone number first. Redirecting you to sign up.",
              ),
            );
            setLocation("/auth");
            return;
          }
          toast.error(
            apiErr?.data?.error ||
              tr(
                "حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى.",
                "An error occurred while creating the order. Please try again.",
              ),
          );
        },
      },
    );
  };

  if (isLoading || !cart) {
    return (
      <div className="p-8 text-center">
        {tr("جاري التحميل...", "Loading...")}
      </div>
    );
  }

  // Pickup waives the delivery fee; everything downstream uses these effective
  // values so the summary, balance check, and submit button stay consistent.
  const isPickup = fulfillmentType === "pickup";
  const effectiveDeliveryFee = isPickup ? 0 : Number(cart.deliveryFee || 0);
  const effectiveTotal = Number(cart.subtotal) + effectiveDeliveryFee;

  return (
    <div className="pb-40 min-h-screen bg-muted/30" dir={dir}>
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/cart">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">{tr("إتمام الطلب", "Checkout")}</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Fulfillment type — delivery vs pickup */}
        <div className="bg-card p-4 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-base mb-3">
            {tr("طريقة الاستلام", "Fulfillment Method")}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!vendorFulfillment.deliveryEnabled}
              onClick={() => setFulfillmentType("delivery")}
              className={`border-2 rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all ${
                !vendorFulfillment.deliveryEnabled
                  ? "opacity-40 cursor-not-allowed border-border"
                  : fulfillmentType === "delivery"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30"
              }`}
            >
              <Bike className="w-5 h-5 text-primary" />
              <span className="text-sm font-bold">
                {tr("توصيل", "Delivery")}
              </span>
            </button>
            <button
              type="button"
              disabled={!vendorFulfillment.pickupEnabled}
              onClick={() => setFulfillmentType("pickup")}
              className={`border-2 rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all ${
                !vendorFulfillment.pickupEnabled
                  ? "opacity-40 cursor-not-allowed border-border"
                  : fulfillmentType === "pickup"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30"
              }`}
            >
              <PackageCheck className="w-5 h-5 text-primary" />
              <span className="text-sm font-bold">
                {tr("استلام من المتجر", "Pickup")}
              </span>
            </button>
          </div>
          {isPickup ? (
            <p className="text-xs text-muted-foreground mt-2">
              {tr(
                "ستستلم طلبك من المتجر — لا توجد رسوم توصيل.",
                "You'll collect your order from the store — no delivery fee.",
              )}
            </p>
          ) : null}
        </div>

        {/* Step 1 — Delivery Info */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              1
            </span>
            {isPickup
              ? tr("بيانات الاستلام", "Pickup Information")
              : tr("بيانات التوصيل", "Delivery Information")}
          </h2>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              id="checkout-form"
            >
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tr("الاسم الكامل", "Full Name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={tr(
                          "مثال: أحمد محمد",
                          "e.g., Ahmad Mohammad",
                        )}
                        className="h-12 bg-muted border-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tr("رقم الهاتف", "Phone Number")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0791234567"
                        dir="ltr"
                        className="h-12 bg-muted border-none text-right"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isPickup && (
                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between mb-1">
                        <FormLabel>
                          {tr("عنوان التوصيل", "Delivery Address")}
                        </FormLabel>
                        <MapPicker
                          onAddressSelect={(address) => {
                            field.onChange(address);
                            localStorage.setItem("al_tayebat_address", address);
                          }}
                        />
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder={tr(
                            "المدينة، المنطقة، الشارع، رقم المبنى",
                            "City, area, street, building number",
                          )}
                          className="min-h-[80px] bg-muted border-none resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {tr(
                        "ملاحظات إضافية (اختياري)",
                        "Additional Notes (optional)",
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={tr(
                          "مثال: يرجى الاتصال عند الوصول",
                          "e.g., Please call upon arrival",
                        )}
                        className="h-12 bg-muted border-none"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        {/* Step 2 — Payment Method */}
        <div
          id="payment-section"
          className="bg-card p-5 rounded-2xl shadow-sm border border-border"
        >
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              2
            </span>
            {tr("طريقة الدفع", "Payment Method")}
          </h2>

          <div className="space-y-3">
            {[
              {
                id: "cod" as PaymentMethod,
                icon: CheckCircle2,
                label: tr("الدفع عند الاستلام", "Cash on Delivery"),
                sub: tr(
                  "ادفع نقداً عند استلام طلبك",
                  "Pay in cash when you receive your order",
                ),
                disabled: false,
              },
              {
                id: "cliq" as PaymentMethod,
                icon: Smartphone,
                label: tr("تحويل كليك CliQ", "CliQ Transfer"),
                sub: vendorPayment.cliqAlias
                  ? tr(
                      `معرف كليك: ${vendorPayment.cliqAlias}@`,
                      `CliQ alias: ${vendorPayment.cliqAlias}@`,
                    )
                  : tr(
                      "البائع لم يفعّل الدفع عبر كليك بعد",
                      "The seller has not enabled CliQ payments yet",
                    ),
                // Manual transfer — works for guests too; only disabled when
                // the seller hasn't provided a CliQ alias.
                disabled: !vendorPayment.cliqAlias,
              },
              {
                id: "iban" as PaymentMethod,
                icon: Landmark,
                label: tr("تحويل بنكي (IBAN)", "Bank Transfer (IBAN)"),
                sub: vendorPayment.bankAccount
                  ? tr(
                      `الآيبان: ${vendorPayment.bankAccount}`,
                      `IBAN: ${vendorPayment.bankAccount}`,
                    )
                  : tr(
                      "البائع لم يفعّل التحويل البنكي بعد",
                      "The seller has not enabled bank transfers yet",
                    ),
                // Manual transfer — works for guests too; only disabled when
                // the seller hasn't provided an IBAN.
                disabled: !vendorPayment.bankAccount,
              },
              {
                id: "ewallet" as PaymentMethod,
                icon: Wallet,
                label: tr("محفظة إلكترونية", "E-Wallet"),
                sub: vendorPayment.walletNumber
                  ? tr(
                      `رقم المحفظة: ${vendorPayment.walletNumber}`,
                      `Wallet number: ${vendorPayment.walletNumber}`,
                    )
                  : tr(
                      "البائع لم يفعّل الدفع بالمحفظة بعد",
                      "The seller has not enabled wallet payments yet",
                    ),
                // Manual transfer — works for guests too; only disabled when
                // the seller hasn't provided a wallet number.
                disabled: !vendorPayment.walletNumber,
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  setPaymentMethod(opt.id);
                }}
                className={`w-full border-2 rounded-xl p-4 flex items-center gap-3 transition-all ${opt.disabled ? "opacity-50 cursor-not-allowed border-border bg-muted/10" : paymentMethod === opt.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${paymentMethod === opt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  <opt.icon className="w-5 h-5" />
                </div>
                <div className="text-right flex-1">
                  <p className="font-bold text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                    {opt.sub}
                  </p>
                </div>
                {paymentMethod === opt.id && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Educational banner — manual payment is verified by the seller */}
          {MANUAL_METHODS.includes(paymentMethod) && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {tr(
                "💡 تنويه: الدفع يتم يدوياً خارج التطبيق. حوّل المبلغ إلى البائع ثم ارفع صورة الإيصال ليتم تأكيد طلبك.",
                "💡 Note: Payment is done manually outside the app. Transfer the amount to the seller, then upload a receipt image so your order can be confirmed.",
              )}
            </div>
          )}

          {/* Payment receipt upload (required for manual transfer methods) */}
          {MANUAL_METHODS.includes(paymentMethod) && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold">
                {paymentMethod === "cliq"
                  ? tr(
                      `حوّل المبلغ إلى كليك: ${vendorPayment.cliqAlias}@ ثم ارفع إيصال الدفع`,
                      `Transfer the amount via CliQ: ${vendorPayment.cliqAlias}@ then upload the payment receipt`,
                    )
                  : paymentMethod === "iban"
                    ? tr(
                        `حوّل المبلغ إلى الآيبان: ${vendorPayment.bankAccount} ثم ارفع إيصال الدفع`,
                        `Transfer the amount to IBAN: ${vendorPayment.bankAccount} then upload the payment receipt`,
                      )
                    : tr(
                        `حوّل المبلغ إلى المحفظة: ${vendorPayment.walletNumber} ثم ارفع إيصال الدفع`,
                        `Transfer the amount to wallet: ${vendorPayment.walletNumber} then upload the payment receipt`,
                      )}
              </p>

              {screenshot ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img
                    src={screenshot}
                    alt={tr("إيصال الدفع", "Payment receipt")}
                    className="w-full max-h-48 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshot(null);
                      setScreenshotName("");
                    }}
                    className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1"
                    aria-label={tr("إزالة", "Remove")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />{" "}
                    {tr("تم رفع الإيصال", "Receipt uploaded")}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-primary/40 rounded-xl py-6 flex flex-col items-center gap-2 hover:bg-primary/5 transition-colors"
                >
                  <Upload className="w-8 h-8 text-primary/60" />
                  <p className="text-sm font-bold text-primary">
                    {tr("ارفع إيصال التحويل", "Upload Transfer Receipt")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tr("PNG، JPG — حتى 5MB", "PNG, JPG — up to 5MB")}
                  </p>
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleScreenshot}
                className="hidden"
              />

              {paymentMethod === "cliq" && vendorPayment.cliqAlias && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
                      {tr("بيانات كليك للتحويل", "CliQ Transfer Details")}
                    </p>
                  </div>
                  <p
                    className="text-sm font-black text-blue-800 dark:text-blue-300 mt-1 text-center"
                    dir="ltr"
                  >
                    @{vendorPayment.cliqAlias}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 text-center">
                    {vendorPayment.storeName}
                  </p>
                </div>
              )}
              {paymentMethod === "iban" && vendorPayment.bankAccount && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {tr("بيانات التحويل البنكي", "Bank Transfer Details")}
                    </p>
                  </div>
                  <p
                    className="text-sm font-black text-emerald-800 dark:text-emerald-300 mt-1 text-center break-all"
                    dir="ltr"
                  >
                    {vendorPayment.bankAccount}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center">
                    {vendorPayment.storeName}
                  </p>
                </div>
              )}
              {paymentMethod === "ewallet" && vendorPayment.walletNumber && (
                <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl p-3 border border-rose-200 dark:border-rose-800">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-rose-600" />
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                      {tr("رقم المحفظة الإلكترونية", "E-Wallet Number")}
                    </p>
                  </div>
                  <p
                    className="text-sm font-black text-rose-800 dark:text-rose-300 mt-1 text-center"
                    dir="ltr"
                  >
                    {vendorPayment.walletNumber}
                  </p>
                  <p className="text-xs text-rose-600 dark:text-rose-400 text-center">
                    {vendorPayment.storeName}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 3 — Summary */}
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              3
            </span>
            {tr("ملخص الطلب", "Order Summary")}
          </h2>

          <div className="space-y-3">
            {cart.items.map((item) => {
              const displayName =
                lang === "en"
                  ? item.productName || item.productNameAr
                  : item.productNameAr;
              return (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex-1 pr-4">
                    {item.quantity} × {displayName}
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {formatPrice(item.totalPrice)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border my-4" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {tr("المجموع الفرعي", "Subtotal")}
              </span>
              <span className="font-medium">{formatPrice(cart.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {isPickup
                  ? tr("الاستلام", "Pickup")
                  : tr("رسوم التوصيل", "Delivery Fee")}
              </span>
              <span className="font-medium">
                {effectiveDeliveryFee === 0
                  ? isPickup
                    ? tr("استلام من المتجر", "Store pickup")
                    : tr("مجاني 🎉", "Free 🎉")
                  : formatPrice(effectiveDeliveryFee)}
              </span>
            </div>
            <div className="border-t border-border mt-3 pt-3" />
            <div className="flex justify-between items-center text-lg font-bold">
              <span>{tr("الإجمالي المطلوب", "Total Due")}</span>
              <span className="text-primary">
                {formatPrice(effectiveTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 p-3 bg-background border-t border-border z-40 max-w-md mx-auto">
        <p className="text-[11px] text-muted-foreground text-center mb-2 flex items-center justify-center gap-1">
          <span aria-hidden>⚠️</span>{" "}
          {tr(
            "لا يمكن إلغاء الطلب بعد تأكيده",
            "Orders cannot be cancelled after confirmation",
          )}
        </p>
        <Button
          type="submit"
          form="checkout-form"
          className="w-full h-13 rounded-full text-base shadow-lg"
          disabled={createOrder.isPending}
        >
          {createOrder.isPending
            ? tr("جاري التأكيد...", "Confirming...")
            : paymentMethod === "cliq"
              ? tr("ادفع عبر كليك ↙", "Pay via CliQ ↙")
              : paymentMethod === "iban"
                ? tr("ادفع عبر التحويل البنكي ↙", "Pay via Bank Transfer ↙")
                : paymentMethod === "ewallet"
                  ? tr("ادفع عبر المحفظة ↙", "Pay via Wallet ↙")
                  : tr("تأكيد الطلب ✓", "Confirm Order ✓")}
        </Button>
      </div>
    </div>
  );
}
