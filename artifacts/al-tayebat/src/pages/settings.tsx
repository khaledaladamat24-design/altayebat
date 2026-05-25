import { useLocation } from "wouter";
import { useClerk, useAuth } from "@clerk/react";
import {
  ChevronRight, Bell, ShieldCheck, Wrench, Trash2, Info, LogOut, ChevronLeft, FileText,
} from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();

  const handleClearCache = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("al_tayebat_"));
    keys.forEach(k => localStorage.removeItem(k));
    toast.success("تم مسح ذاكرة التخزين المؤقتة");
  };

  const handleSignOut = () => {
    if (isSignedIn) {
      signOut().then(() => setLocation("/"));
    } else {
      setLocation("/");
    }
  };

  const rows = [
    {
      icon: Bell,
      label: "الإشعارات",
      iconColor: "text-amber-500",
      iconBg: "bg-amber-50",
      onPress: () => toast("قريباً", { description: "إعدادات الإشعارات" }),
    },
    {
      icon: ShieldCheck,
      label: "سياسة الخصوصية",
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50",
      onPress: () => setLocation("/privacy-policy"),
    },
    {
      icon: FileText,
      label: "إعدادات الخصوصية",
      iconColor: "text-indigo-500",
      iconBg: "bg-indigo-50",
      onPress: () => toast("قريباً", { description: "إعدادات الخصوصية التفصيلية" }),
    },
    {
      icon: Wrench,
      label: "أداة التشخيص",
      iconColor: "text-slate-500",
      iconBg: "bg-slate-50",
      onPress: () => toast("قريباً"),
    },
    {
      icon: Trash2,
      label: "مسح ذاكرة التخزين المؤقتة",
      iconColor: "text-rose-500",
      iconBg: "bg-rose-50",
      suffix: "محلي",
      onPress: handleClearCache,
    },
    {
      icon: Info,
      label: "عن الطيبات",
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
      suffix: "1.1.0",
      onPress: () => toast("الطيبات — تطبيق توصيل الغذاء الصحي في الأردن 🇯🇴"),
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      <div className="max-w-md mx-auto bg-background min-h-screen shadow-sm border-x border-border/50">
      {/* Header */}
      <div className="bg-background border-b border-border sticky top-0 z-20 px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => setLocation("/account")} className="p-1 -mr-1">
          <ChevronRight className="w-6 h-6 text-foreground" />
        </button>
        <h1 className="text-xl font-black flex-1 text-center pr-4">الإعدادات</h1>
      </div>

      <div className="px-4 py-4 space-y-2">
        {/* Settings rows */}
        <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
          {rows.map((row, i) => (
            <button
              key={row.label}
              onClick={row.onPress}
              className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/40 transition-colors text-right ${i < rows.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className={`w-9 h-9 rounded-xl ${row.iconBg} flex items-center justify-center shrink-0`}>
                <row.icon className={`w-5 h-5 ${row.iconColor}`} />
              </div>
              <span className="flex-1 font-bold text-sm">{row.label}</span>
              {row.suffix && (
                <span className="text-xs text-muted-foreground font-medium">{row.suffix}</span>
              )}
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full bg-background border border-border rounded-2xl px-4 py-4 flex items-center gap-3 hover:bg-destructive/5 transition-colors shadow-sm"
        >
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <LogOut className="w-5 h-5 text-destructive" />
          </div>
          <span className="font-bold text-destructive text-sm flex-1 text-right">
            {isSignedIn ? "تسجيل الخروج" : "العودة للرئيسية"}
          </span>
        </button>

        <p className="text-center text-xs text-muted-foreground pt-4">
          الطيبات — صنع بكل حب في الأردن 🇯🇴
        </p>
      </div>
      </div>
    </div>
  );
}
