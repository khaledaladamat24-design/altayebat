import { Link } from "wouter";
import { ChevronRight, UserCircle, Phone, MapPin, Package, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Account() {
  const name = localStorage.getItem('al_tayebat_name') || "";
  const phone = localStorage.getItem('al_tayebat_phone') || "";
  const address = localStorage.getItem('al_tayebat_address') || "";

  return (
    <div className="pb-8 min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10">
        <h1 className="text-2xl font-bold mb-4">حسابي</h1>
        
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary-foreground/20 rounded-full flex items-center justify-center">
            <UserCircle className="w-10 h-10" />
          </div>
          <div>
            <h2 className="font-bold text-lg">{name || 'ضيف (زائر)'}</h2>
            {phone && <p className="text-primary-foreground/80 text-sm" dir="ltr">{phone}</p>}
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-6">
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h3 className="font-bold text-sm text-muted-foreground">معلومات محفوظة للتوصيل</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">رقم الهاتف</p>
                <p className="font-medium text-sm">{phone || 'غير مسجل'}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">العنوان الأخير</p>
                <p className="font-medium text-sm leading-relaxed">{address || 'غير مسجل'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <Link href="/orders">
            <div className="p-4 flex items-center justify-between hover-elevate cursor-pointer transition-colors border-b border-border">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-primary" />
                <span className="font-bold">طلباتي السابقة</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
            </div>
          </Link>
          
          <div className="p-4 flex items-center justify-between hover-elevate cursor-pointer transition-colors border-b border-border">
            <div className="flex items-center gap-3">
              <HeartHandshake className="w-5 h-5 text-accent" />
              <span className="font-bold">تواصل معنا</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
          </div>
        </div>
        
        <div className="text-center text-xs text-muted-foreground pt-4">
          <p>تطبيق الطيبات للإصدار 1.0.0</p>
          <p className="mt-1">صنع بكل حب في الأردن 🇯🇴</p>
        </div>
      </div>
    </div>
  );
}
