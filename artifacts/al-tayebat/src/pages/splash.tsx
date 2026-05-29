import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useLanguage } from "@/contexts/language";

export default function Splash() {
  const [, setLocation] = useLocation();
  const { dir, tr } = useLanguage();

  const handleContinue = () => {
    localStorage.setItem("al_tayebat_onboarded_v2", "1");
    setLocation("/auth");
  };

  return (
    <div className="relative min-h-screen w-full max-w-md mx-auto overflow-hidden" dir={dir}>
      {/* Background food image */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=85"
          alt={tr("طعام صحي", "Healthy food")}
          className="w-full h-full object-cover"
        />
        {/* Dark gradient overlay - stronger at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/85" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen px-6 pt-safe">
        {/* Logo */}
        <div className="flex justify-center pt-16 pb-4">
          <div className="bg-white/15 backdrop-blur-sm border border-white/30 rounded-3xl px-6 py-2 shadow-lg">
            <span className="text-white text-2xl font-black tracking-wide drop-shadow">{tr("الطيبات", "Al-Tayebat")}</span>
          </div>
        </div>

        {/* Spacer push content to bottom */}
        <div className="flex-1" />

        {/* Bottom content */}
        <div className="pb-10 space-y-5">
          {/* Welcome text */}
          <div className="text-center">
            <h1 className="text-white text-3xl font-black mb-2 drop-shadow-lg">
              {tr("أهلاً بك في الطيبات", "Welcome to Al-Tayebat")}
            </h1>
            <p className="text-white/85 text-base font-medium drop-shadow">
              {tr("تناول طعاماً أفضل وعيش حياةً أفضل", "Eat better, live better")}
            </p>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleContinue}
            className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground text-xl font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
          >
            {tr("متابعة", "Continue")}
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Privacy */}
          <p className="text-center text-white/65 text-xs leading-relaxed px-2">
            {tr("بالمتابعة، فإنك توافق على ", "By continuing, you agree to our ")}
            <span className="underline text-white/85 cursor-pointer">{tr("سياسة الخصوصية", "Privacy Policy")}</span>
            {tr(" الخاصة بنا. تحتاج الطيبات إلى الوصول لموقعك لتسهيل توصيل الطلبات وتقديم توصيات مخصصة لك.", ". Al-Tayebat needs access to your location to facilitate order delivery and provide personalized recommendations.")}
          </p>
        </div>
      </div>
    </div>
  );
}
