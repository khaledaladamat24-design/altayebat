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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

function SplashGate({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!localStorage.getItem("al_tayebat_onboarded")) {
      setLocation("/splash");
    }
  }, [setLocation]);
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/splash" component={Splash} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/settings" component={Settings} />
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
