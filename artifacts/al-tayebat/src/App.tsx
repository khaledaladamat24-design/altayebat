import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import Home from "@/pages/home";
import Categories from "@/pages/categories";
import Category from "@/pages/category";
import Product from "@/pages/product";
import Search from "@/pages/search";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/order-detail";
import Account from "@/pages/account";
import Login from "@/pages/login";
import Admin from "@/pages/admin";
import Splash from "@/pages/splash";
import Settings from "@/pages/settings";
import Auth from "@/pages/auth";
import Register from "@/pages/register";
import PrivacyPolicy from "@/pages/privacy-policy";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

const SPLASH_EXCLUDED = ["/splash", "/auth", "/login", "/admin", "/settings", "/register", "/privacy-policy"];
const ONBOARD_KEY = "al_tayebat_onboarded_v2";
const AUTH_SKIPPED_KEY = "al_tayebat_auth_skipped_v2";

function SplashGate({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const excluded = SPLASH_EXCLUDED.some(p => location.startsWith(p));
    if (excluded) return;

    if (!localStorage.getItem(ONBOARD_KEY)) {
      setLocation("/splash");
      return;
    }
    const signedIn = !!localStorage.getItem("al_tayebat_firebase_uid") || !!localStorage.getItem("__clerk_db_jwt");
    if (!signedIn && !localStorage.getItem(AUTH_SKIPPED_KEY)) {
      setLocation("/auth");
    }
  }, [location, setLocation]);
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/splash" component={Splash} />
      <Route path="/auth" component={Auth} />
      <Route path="/register" component={Register} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/settings" component={Settings} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route>
        <SplashGate>
          <AppLayout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/categories" component={Categories} />
              <Route path="/category/:id" component={Category} />
              <Route path="/product/:id" component={Product} />
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

function App() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      {...(import.meta.env.PROD ? { proxyUrl: "/api/__clerk" } : {})}
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
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster position="top-center" rtl={true} />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
