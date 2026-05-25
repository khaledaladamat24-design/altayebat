import { useState } from "react";
import { useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Phone, X, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const { openSignIn } = useClerk();
  const [email, setEmail] = useState("");

  const handleContinue = () => {
    if (email && !email.includes("@")) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    openSignIn({
      appearance: {
        elements: {
          rootBox: "font-[Cairo,sans-serif]",
          card: "rounded-2xl shadow-xl",
          headerTitle: "text-2xl font-black",
          formButtonPrimary: "bg-primary hover:bg-primary/90 rounded-xl h-12 font-bold text-base",
          formFieldInput: "rounded-xl h-12 border-border",
          footerActionLink: "text-rose font-bold",
        },
      },
    });
  };

  const handlePhoneContinue = () => {
    openSignIn({});
  };

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-md mx-auto" dir="rtl">
      {/* Top food image section */}
      <div className="relative h-56 shrink-0 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"
          alt="طعام الطيبات"
          className="w-full h-full object-cover"
        />
        {/* Discount badge */}
        <div className="absolute top-4 left-4 bg-rose text-white rounded-2xl px-3 py-2 shadow-lg">
          <div className="text-xs font-bold leading-none">خصم</div>
          <div className="text-3xl font-black leading-tight">%20</div>
          <div className="text-[10px] font-medium leading-none">على أول طلب</div>
        </div>
        {/* Close button */}
        <button
          onClick={() => setLocation("/")}
          className="absolute top-4 right-4 bg-black/40 text-white rounded-full p-1.5 backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form section */}
      <div className="flex-1 px-6 pt-6 pb-8 space-y-5">
        <h1 className="text-2xl font-black text-foreground text-center">
          إنشاء حساب أو تسجيل الدخول
        </h1>

        {/* Email input */}
        <div className="relative">
          <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            className="w-full h-14 rounded-2xl border border-border bg-muted/40 pr-12 pl-4 text-base outline-none focus:border-primary transition-colors text-right"
            dir="ltr"
          />
        </div>

        {/* Continue button */}
        <button
          onClick={handleContinue}
          className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground text-lg font-black rounded-2xl shadow-md transition-all"
        >
          المتابعة
        </button>

        {/* Privacy */}
        <p className="text-center text-muted-foreground text-xs leading-relaxed">
          باختيارك للمتابعة يعني موافقتك على{" "}
          <span className="text-foreground underline cursor-pointer font-medium">اتفاقية المستخدم</span>
          {" "}و{" "}
          <span className="text-foreground underline cursor-pointer font-medium">سياسة الخصوصية</span>
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm font-medium">أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Phone option */}
        <button
          onClick={handlePhoneContinue}
          className="w-full h-14 border border-border rounded-2xl flex items-center justify-center gap-3 text-base font-bold hover:bg-muted/40 active:scale-[0.98] transition-all"
        >
          <Phone className="w-5 h-5 text-primary" />
          الاستمرار باستخدام رقم الهاتف
        </button>

        {/* Guest option */}
        <button
          onClick={() => setLocation("/")}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2 font-medium"
        >
          تخطّى — تصفح كضيف
        </button>
      </div>
    </div>
  );
}
