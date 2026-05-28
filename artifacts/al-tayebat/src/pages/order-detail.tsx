import { useGetOrder } from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ChevronRight, Package, Truck, CheckCircle2, Clock, Phone, ExternalLink, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { toast } from "sonner";

interface TrackInfo {
  trackingNumber: string | null;
  awbUrl?: string | null;
  status?: string | null;
  statusAr?: string | null;
  providerName?: string | null;
  providerPhone?: string | null;
  notConfigured?: boolean;
}

const statusConfig = {
  pending: { label: "قيد الانتظار", icon: Clock, color: "text-amber-500", bg: "bg-amber-500" },
  confirmed: { label: "تم التأكيد", icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500" },
  preparing: { label: "قيد التحضير", icon: Package, color: "text-indigo-500", bg: "bg-indigo-500" },
  on_the_way: { label: "في الطريق", icon: Truck, color: "text-primary", bg: "bg-primary" },
  delivered: { label: "تم التوصيل", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-600" },
  cancelled: { label: "ملغي", icon: Clock, color: "text-destructive", bg: "bg-destructive" },
};

const statusOrder = ["pending", "confirmed", "preparing", "on_the_way", "delivered"];

export default function OrderDetail() {
  const params = useParams();
  const orderId = params.id ? parseInt(params.id, 10) : undefined;
  
  const { data: order, isLoading } = useGetOrder(orderId!, {
    query: { enabled: !!orderId }
  });

  // Tracking lives outside the OpenAPI Order schema for now (server side has
  // delivery_* columns but they're not exposed via /api/orders). We fetch it
  // separately from /api/delivery/orders/:id/track which returns null tracking
  // for orders that haven't been shipped yet.
  const [track, setTrack] = useState<TrackInfo | null>(null);
  useEffect(() => {
    if (!orderId) return;
    fetch(apiUrl(`/api/delivery/orders/${orderId}/track`))
      .then(r => (r.ok ? r.json() : null))
      .then(setTrack)
      .catch(() => setTrack(null));
  }, [orderId]);

  if (isLoading || !order) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const currentStatusIndex = statusOrder.indexOf(order.status);
  const isCancelled = order.status === "cancelled";

  return (
    <div className="pb-8 min-h-screen bg-muted/30">
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/orders">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">طلب #{order.id}</h1>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {format(new Date(order.createdAt), "dd MMMM yyyy - hh:mm a", { locale: ar })}
          </p>
          <h2 className="text-2xl font-bold text-primary mb-6">{formatPrice(order.total)}</h2>

          {!isCancelled ? (
            <div className="relative pt-2 pb-6">
              {/* Progress Line */}
              <div className="absolute top-6 left-8 right-8 h-1 bg-muted rounded-full -z-10"></div>
              <div 
                className="absolute top-6 right-8 h-1 bg-primary rounded-full transition-all duration-500 -z-10"
                style={{ width: `${(Math.max(0, currentStatusIndex) / (statusOrder.length - 1)) * 100}%` }}
              ></div>
              
              <div className="flex justify-between relative z-0">
                {statusOrder.map((status, index) => {
                  const config = statusConfig[status as keyof typeof statusConfig];
                  const Icon = config.icon;
                  const isCompleted = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  
                  return (
                    <div key={status} className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 transition-colors duration-300 ${
                        isCompleted ? config.bg + ' text-white shadow-md' : 'bg-muted text-muted-foreground border-2 border-background'
                      } ${isCurrent ? 'ring-4 ring-primary/20 scale-110' : ''}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-bold ${isCurrent ? config.color : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {config.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-destructive font-bold bg-destructive/10 p-4 rounded-xl">
              <Clock className="w-5 h-5" />
              تم إلغاء هذا الطلب
            </div>
          )}
          
          {order.estimatedDelivery && !isCancelled && currentStatusIndex < 4 && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-4 text-sm font-medium text-primary">
              الوقت المتوقع للتوصيل: {order.estimatedDelivery}
            </div>
          )}
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h3 className="font-bold text-lg mb-4">المنتجات</h3>
          <div className="space-y-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="bg-muted w-8 h-8 flex items-center justify-center rounded-md font-bold text-xs text-primary">
                    {item.quantity}x
                  </div>
                  <span>{item.productNameAr}</span>
                </div>
                <span className="font-medium">{formatPrice(item.totalPrice)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h3 className="font-bold text-lg mb-4">تفاصيل الدفع</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>المجموع الفرعي</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>رسوم التوصيل</span>
              <span>{order.deliveryFee === 0 ? 'مجاني' : formatPrice(order.deliveryFee)}</span>
            </div>
            <div className="border-t border-border mt-3 pt-3 flex justify-between items-center font-bold">
              <span>الإجمالي</span>
              <span className="text-primary">{formatPrice(order.total)}</span>
            </div>
            <div className="bg-muted p-2 rounded text-xs text-center mt-2 text-muted-foreground">
              طريقة الدفع: الدفع عند الاستلام
            </div>
          </div>
        </div>

        {track?.trackingNumber && (
          <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Truck className="w-5 h-5 text-primary" /> الشحن</h3>
            <div className="space-y-3 text-sm">
              {track.providerName && (
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">شركة التوصيل</span>
                  <span className="font-bold">{track.providerName}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block text-xs mb-1">رقم التتبع</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary" dir="ltr">{track.trackingNumber}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(track.trackingNumber!); toast.success("تم نسخ رقم التتبع"); }}
                    className="p-1.5 hover:bg-muted rounded-md" aria-label="نسخ">
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              {track.statusAr && (
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">حالة الشحنة</span>
                  <span className="font-medium">{track.statusAr}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {track.awbUrl && (
                  <a href={track.awbUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-bold">
                    <ExternalLink className="w-3 h-3" /> بوليصة الشحن (AWB)
                  </a>
                )}
                {track.providerPhone && (
                  <a href={`tel:${track.providerPhone}`}
                    className="flex items-center gap-1 text-xs bg-muted px-3 py-1.5 rounded-lg font-bold">
                    <Phone className="w-3 h-3" /> {track.providerPhone}
                  </a>
                )}
              </div>
              {track.notConfigured && (
                <p className="text-[11px] text-amber-600 bg-amber-50 p-2 rounded-md">
                  هذه الشركة لم يتم ربط API الخاص بها بعد — رقم التتبع يدوي.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border mb-8">
          <h3 className="font-bold text-lg mb-4">بيانات التوصيل</h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs mb-1">الاسم</span>
              <span className="font-medium">{order.customerName}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">رقم الهاتف</span>
              <span className="font-medium" dir="ltr">{order.customerPhone}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs mb-1">العنوان</span>
              <span className="font-medium">{order.deliveryAddress}</span>
            </div>
            {order.notes && (
              <div>
                <span className="text-muted-foreground block text-xs mb-1">ملاحظات</span>
                <span className="font-medium">{order.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
