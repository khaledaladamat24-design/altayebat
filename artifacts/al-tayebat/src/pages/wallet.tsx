import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { ChevronRight, Wallet as WalletIcon, Plus, Upload, X, CheckCircle2, Clock, XCircle, Smartphone, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-url";
import { formatPrice } from "@/lib/utils";
import { useLanguage } from "@/contexts/language";

type TopupMethod = "cliq" | "wallet" | "cash";

interface Transaction {
  id: number;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  paymentMethod: string | null;
  screenshotUrl: string | null;
  orderId: number | null;
  createdAt: string;
}

interface WalletData {
  balance: number;
  transactions: Transaction[];
  platformCliqAlias: string | null;
  platformWalletNumber: string | null;
}

export default function WalletPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const { lang, dir, tr } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);

  const userId = typeof window !== "undefined" ? localStorage.getItem("al_tayebat_user_id") : null;

  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<TopupMethod>("cliq");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      toast.error(tr("سجّل دخولك لاستخدام المحفظة", "Sign in to use your wallet"));
      setLocation("/auth");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  const fetchWallet = async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const res = await fetch(apiUrl(`/api/wallet/${userId}`));
      if (res.ok) setData(await res.json());
    } catch {
      toast.error(tr("فشل تحميل المحفظة", "Failed to load your wallet"));
    }
    setLoading(false);
  };

  useEffect(() => { fetchWallet(); }, [userId]);

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error(tr("حجم الصورة أقل من 5MB", "Image must be smaller than 5MB")); return; }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleTopup = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error(tr("أدخل مبلغاً صحيحاً", "Enter a valid amount")); return; }
    if (method !== "cash" && !screenshot) { toast.error(tr("ارفع إيصال التحويل", "Please upload the transfer receipt")); return; }
    if (!userId) { toast.error(tr("سجّل دخولك أولاً", "Please sign in first")); return; }
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/wallet/${userId}/topup`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, paymentMethod: method, screenshotUrl: screenshot }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || tr("فشل إرسال طلب الشحن", "Failed to submit top-up request"));
      }
      toast.success(tr("تم إرسال طلب الشحن — سيُراجَع خلال وقت قصير", "Top-up request submitted — it will be reviewed shortly"));
      setShowTopupModal(false);
      setAmount(""); setScreenshot(null); setMethod("cliq");
      fetchWallet();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSubmitting(false);
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />{tr("مقبول", "Approved")}</span>;
    if (status === "rejected") return <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />{tr("مرفوض", "Rejected")}</span>;
    return <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />{tr("قيد المراجعة", "Pending review")}</span>;
  };

  const typeLabel = (t: string) =>
    t === "topup" ? tr("شحن رصيد", "Top-up")
    : t === "payment" ? tr("دفع طلب", "Order payment")
    : t === "refund" ? tr("استرداد", "Refund")
    : t;

  if (loading || !isLoaded) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20" dir={dir}>
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setLocation("/account")} className="p-1.5 -mr-1">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </button>
        <h1 className="text-lg font-black">{tr("محفظتي", "My Wallet")}</h1>
      </div>

      {/* Balance card */}
      <div className="px-4 pt-5">
        <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <WalletIcon className="w-5 h-5" />
            <p className="text-sm opacity-90">{tr("الرصيد الحالي", "Current balance")}</p>
          </div>
          <p className="text-4xl font-black tracking-tight">
            {data ? formatPrice(data.balance) : "—"}
          </p>
          <Button
            onClick={() => setShowTopupModal(true)}
            className="mt-4 w-full bg-white text-primary hover:bg-white/90 h-12 rounded-xl font-black gap-2 shadow-md">
            <Plus className="w-4 h-4" /> {tr("شحن رصيد", "Top up")}
          </Button>
        </div>
      </div>

      {/* Transactions */}
      <div className="px-4 mt-6">
        <h2 className="font-black text-base mb-3">{tr("سجلّ العمليات", "Transaction history")}</h2>
        {!data || data.transactions.length === 0 ? (
          <div className="bg-muted/30 rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {tr('لا توجد عمليات بعد. اضغط "شحن رصيد" لتبدأ.', 'No transactions yet. Tap "Top up" to get started.')}
          </div>
        ) : (
          <div className="space-y-2">
            {data.transactions.map(t => (
              <div key={t.id} className="bg-card rounded-xl p-3 border border-border flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.type === "topup" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-rose/10 text-rose"}`}>
                  {t.type === "topup" ? <Plus className="w-5 h-5" /> : <WalletIcon className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm">{typeLabel(t.type)}</p>
                    {statusBadge(t.status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description || "—"}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{new Date(t.createdAt).toLocaleString(lang === "ar" ? "ar-JO" : "en-JO")}</p>
                </div>
                <p className={`font-black text-sm shrink-0 ${t.type === "topup" && t.status === "approved" ? "text-green-600" : "text-foreground"}`}>
                  {t.type === "topup" ? "+" : "-"}{formatPrice(t.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-up modal */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => !submitting && setShowTopupModal(false)}>
          <div className="bg-card rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} dir={dir}>
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between rounded-t-3xl">
              <h2 className="font-black text-lg">{tr("شحن الرصيد", "Top up balance")}</h2>
              <button onClick={() => setShowTopupModal(false)} className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">{tr("المبلغ (د.أ)", "Amount (JOD)")}</label>
                <Input type="number" inputMode="decimal" min="1" step="0.5" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10" className="h-12 text-lg font-bold" dir="ltr" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground">{tr("طريقة الدفع", "Payment method")}</label>
                {[
                  { id: "cliq" as TopupMethod, icon: CreditCard, label: tr("تحويل كليك CliQ", "CliQ transfer"), value: data?.platformCliqAlias ? `@${data.platformCliqAlias}` : tr("غير مفعّل بعد", "Not configured yet") },
                  { id: "wallet" as TopupMethod, icon: Smartphone, label: tr("محفظة إلكترونية", "Mobile wallet"), value: data?.platformWalletNumber || tr("غير مفعّل بعد", "Not configured yet") },
                ].map(opt => (
                  <button key={opt.id} type="button" onClick={() => setMethod(opt.id)}
                    className={`w-full border-2 rounded-xl p-3 flex items-center gap-3 transition-all text-right ${method === opt.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
                    <opt.icon className={`w-5 h-5 shrink-0 ${method === opt.id ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1">
                      <p className="font-bold text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{opt.value}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                💡 {tr(
                  "حوّل المبلغ المطلوب إلى الرقم/المعرف أعلاه، ثم ارفع صورة إيصال التحويل أدناه. سيُراجَع الطلب ويُضاف الرصيد لمحفظتك خلال وقت قصير.",
                  "Transfer the desired amount to the number/alias above, then upload a screenshot of the transfer receipt below. We'll review your request and credit your wallet shortly."
                )}
              </div>

              {/* Screenshot upload */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">{tr("إيصال التحويل", "Transfer receipt")}</label>
                {screenshot ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img src={screenshot} alt={tr("إيصال", "Receipt")} className="w-full max-h-48 object-cover" />
                    <button type="button" onClick={() => setScreenshot(null)} className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-primary/40 rounded-xl py-6 flex flex-col items-center gap-2 hover:bg-primary/5">
                    <Upload className="w-7 h-7 text-primary/60" />
                    <p className="text-sm font-bold text-primary">{tr("ارفع إيصال التحويل", "Upload transfer receipt")}</p>
                    <p className="text-[10px] text-muted-foreground">{tr("PNG، JPG — حتى 5MB", "PNG, JPG — up to 5MB")}</p>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleScreenshot} className="hidden" />
              </div>

              <Button onClick={handleTopup} disabled={submitting} className="w-full h-12 rounded-xl font-black gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {submitting ? tr("جاري الإرسال...", "Sending...") : tr("إرسال طلب الشحن", "Submit top-up request")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
