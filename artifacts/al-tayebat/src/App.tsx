import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider, useLanguage } from "@/contexts/language";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import {
  setBaseUrl,
  setDefaultHeadersGetter,
} from "@workspace/api-client-react";
import { checkForAppUpdate } from "@/lib/app-update";
import { consumePendingRoute } from "@/lib/app-nav";

// In Capacitor/Android builds, the web bundle is served from the local
// filesystem so relative `/api` URLs do not reach the Replit backend.
// Set VITE_API_BASE_URL (e.g. https://your-app.replit.app/api) for native builds.
// Orval-generated hooks call paths like `/api/categories`. setBaseUrl prepends
// without rewriting, so the secret MUST be just the origin (no `/api` suffix)
// to avoid `/api/api/...`. Normalize either form so users can set either.
const rawApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (rawApiBase) {
  const origin = rawApiBase.replace(/\/+$/, "").replace(/\/api$/, "");
  setBaseUrl(origin);
}

// Phone-authenticated users have no Clerk session cookie, so forward their
// Firebase uid as `x-firebase-uid` on every generated-hook request. The server
// resolves it to the DB user (see getActingDbUserId). Clerk users rely on the
// session cookie and are unaffected.
setDefaultHeadersGetter((): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const fbUid = window.localStorage.getItem("al_tayebat_firebase_uid");
    return fbUid ? { "x-firebase-uid": fbUid } : {};
  } catch {
    return {};
  }
});

// Detect Capacitor native shell — affects router base and Clerk proxy config.
const isNative =
  typeof window !== "undefined" &&
  !!(
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor?.isNativePlatform?.();
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import Home from "@/pages/home";
import Categories from "@/pages/categories";
import Category from "@/pages/category";
import Offers from "@/pages/offers";
import Product from "@/pages/product";
import Vendor from "@/pages/vendor";
import Search from "@/pages/search";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/order-detail";
import Account from "@/pages/account";
import Admin from "@/pages/admin";
import Splash from "@/pages/splash";
import Settings from "@/pages/settings";
import Auth from "@/pages/auth";
import Register from "@/pages/register";
import PrivacyPolicy from "@/pages/privacy-policy";
import VendorDashboard from "@/pages/vendor-dashboard";
import PaymentMethods from "@/pages/payment-methods";
import CompleteLocation from "@/pages/complete-location";
import { isSignedIn, hasLocation } from "@/lib/location-gate";
import { CartActionsProvider } from "@/contexts/cart-actions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

const SPLASH_EXCLUDED = [
  "/splash",
  "/auth",
  "/admin",
  "/settings",
  "/register",
  "/privacy-policy",
  "/vendor-dashboard",
  "/complete-location",
];
const ONBOARD_KEY = "al_tayebat_onboarded_v2";
const AUTH_SKIPPED_KEY = "al_tayebat_auth_skipped_v2";

function SplashGate({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const excluded = SPLASH_EXCLUDED.some((p) => location.startsWith(p));
    if (excluded) return;

    // Guard: never navigate to the location we're already on. Without this,
    // an unstable setLocation reference from wouter v3 can trigger React #185
    // (Maximum update depth) on Android WebView.
    if (!localStorage.getItem(ONBOARD_KEY)) {
      if (location !== "/splash") setLocation("/splash");
      return;
    }
    const signedIn = isSignedIn();
    if (
      !signedIn &&
      !localStorage.getItem(AUTH_SKIPPED_KEY) &&
      location !== "/auth"
    ) {
      setLocation("/auth");
      return;
    }
    // Mandatory location: a signed-in user must store a permanent delivery
    // location before reaching the main app.
    if (signedIn && !hasLocation() && location !== "/complete-location") {
      setLocation("/complete-location");
    }
    // setLocation intentionally omitted — wouter v3 may return a new reference
    // each render, which would cause this effect to loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/splash" component={Splash} />
      <Route path="/auth" component={Auth} />
      <Route path="/register" component={Register} />
      <Route path="/admin" component={Admin} />
      <Route path="/complete-location" component={CompleteLocation} />
      <Route path="/settings" component={Settings} />
      <Route path="/vendor-dashboard" component={VendorDashboard} />
      <Route path="/payment-methods" component={PaymentMethods} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route>
        <SplashGate>
          <AppLayout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/categories" component={Categories} />
              <Route path="/category/:id" component={Category} />
              <Route path="/offers/:zone" component={Offers} />
              <Route path="/product/:id" component={Product} />
              <Route path="/vendor/:id" component={Vendor} />
              <Route path="/search" component={Search} />
              <Route path="/cart" component={Cart} />
              <Route path="/checkout" component={Checkout} />
              <Route path="/orders" component={Orders} />
              <Route path="/orders/:id" component={OrderDetail} />
              <Route path="/account" component={Account} />
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
        </SplashGate>
      </Route>
    </Switch>
  );
}

// Diagnostic fallback so blank screens on native APK builds surface a useful
// message instead of just white. Most common cause: missing VITE_CLERK_*/VITE_API_BASE_URL
// in the GitHub Actions build secrets.
function FatalScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafaf7",
        color: "#1f2937",
        fontFamily: "Cairo, system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "48px", marginBottom: "12px" }}>⚠️</div>
      <h1
        style={{
          fontSize: "20px",
          fontWeight: 900,
          color: "#1f5135",
          marginBottom: "12px",
        }}
      >
        {title}
      </h1>
      <pre
        style={{
          fontSize: "11px",
          color: "#6b7280",
          maxWidth: "340px",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          textAlign: "right",
          fontFamily: "monospace",
          maxHeight: "50vh",
          overflow: "auto",
        }}
      >
        {detail}
      </pre>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "20px",
          padding: "12px 24px",
          borderRadius: "12px",
          background: "#1f5135",
          color: "white",
          border: "none",
          fontWeight: 700,
          fontSize: "14px",
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; stack: string }
> {
  state = { error: null as Error | null, stack: "" };
  static getDerivedStateFromError(error: Error) {
    return { error, stack: "" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.setState({ error, stack: info.componentStack || "" });
  }
  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error);
      const top = this.state.stack.split("\n").slice(0, 8).join("\n");
      return (
        <FatalScreen
          title="حدث خطأ غير متوقع"
          detail={`${msg}\n\n— أين حدث —\n${top}`}
        />
      );
    }
    return this.props.children;
  }
}

function App() {
  if (!clerkPubKey) {
    return (
      <FatalScreen
        title="إعدادات ناقصة"
        detail="مفتاح Clerk (VITE_CLERK_PUBLISHABLE_KEY) غير موجود في هذه النسخة من التطبيق. أعد بناء APK بعد إضافة المتغيرات المطلوبة في GitHub Secrets."
      />
    );
  }
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ClerkProvider
          publishableKey={clerkPubKey}
          afterSignOutUrl={
            (isNative ? "" : import.meta.env.BASE_URL.replace(/\/$/, "")) +
            "/auth"
          }
          {...(import.meta.env.PROD && !isNative
            ? { proxyUrl: "/api/__clerk" }
            : {})}
          appearance={{
            variables: {
              colorPrimary: "hsl(152 41% 30%)",
              colorDanger: "hsl(349 68% 62%)",
              borderRadius: "0.75rem",
              fontFamily: "Cairo, sans-serif",
            },
          }}
        >
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <CartActionsProvider>
                <WouterRouter
                  base={
                    isNative ? "" : import.meta.env.BASE_URL.replace(/\/$/, "")
                  }
                >
                  <NotificationNav />
                  <Router />
                </WouterRouter>
              </CartActionsProvider>
              <AppToaster />
              <AppUpdateGate />
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

function AppToaster() {
  const { dir } = useLanguage();
  return <Toaster position="top-center" dir={dir} />;
}

// When the vendor taps a new-order notification, navigate straight to the live
// orders list. Native only: reads the pending route on app start and on every
// resume (tapping a notification while backgrounded/killed brings the app to
// the foreground, firing the Capacitor "resume" event). No-op on web.
function NotificationNav() {
  const [, navigate] = useLocation();
  useEffect(() => {
    void consumePendingRoute(navigate);
    let remove: (() => void) | undefined;
    void (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        const handle = await CapApp.addListener("resume", () => {
          void consumePendingRoute(navigate);
        });
        remove = () => void handle.remove();
      } catch {
        // @capacitor/app unavailable (web preview) — nothing to listen for.
      }
    })();
    return () => {
      remove?.();
    };
    // navigate identity may change across renders; we only want this wired once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Fire a Google Play in-app update check once on native app start. No-op on web.
function AppUpdateGate() {
  useEffect(() => {
    void checkForAppUpdate();
  }, []);
  return null;
}

export default App;
