import { SignIn } from "@clerk/react";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-primary text-primary-foreground pt-14 pb-8 px-6 rounded-b-3xl text-center">
        <div className="w-16 h-16 bg-primary-foreground/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <span className="text-3xl font-bold">ط</span>
        </div>
        <h1 className="text-2xl font-bold">الطيبات</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">سجّل دخولك لإدارة طلباتك</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <SignIn
            routing="hash"
            afterSignInUrl="/"
            afterSignUpUrl="/"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border border-border rounded-2xl w-full bg-card",
                headerTitle: "text-foreground font-bold text-xl",
                headerSubtitle: "text-muted-foreground text-sm",
                formButtonPrimary:
                  "bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-12 font-bold",
                formFieldInput:
                  "border border-border rounded-xl h-12 px-3 bg-muted focus:border-primary",
                footerActionLink: "text-rose font-semibold",
                identityPreviewEditButton: "text-rose",
                formFieldLabel: "text-foreground font-medium text-sm",
                dividerLine: "bg-border",
                dividerText: "text-muted-foreground text-xs",
                socialButtonsBlockButton:
                  "border border-border rounded-xl h-11 hover:bg-muted font-medium",
                socialButtonsBlockButtonText: "text-foreground font-medium",
              },
              layout: { socialButtonsVariant: "blockButton" },
            }}
          />

          <button
            onClick={() => setLocation("/")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            متابعة كضيف بدون تسجيل
          </button>
        </div>
      </div>
    </div>
  );
}
