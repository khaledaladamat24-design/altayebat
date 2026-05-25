import { Link, useLocation } from "wouter";
import { Home, Grid, ShoppingCart, ListOrdered, User } from "lucide-react";
import { useGetCart } from "@workspace/api-client-react";
import { useSession } from "@/hooks/use-session";

export function BottomNav() {
  const [location] = useLocation();
  const sessionId = useSession();
  const { data: cart } = useGetCart({ sessionId }, { query: { enabled: !!sessionId } });

  const navItems = [
    { name: "الرئيسية", path: "/", icon: Home },
    { name: "الأقسام", path: "/categories", icon: Grid },
    { name: "السلة", path: "/cart", icon: ShoppingCart, badge: cart?.itemCount || 0 },
    { name: "طلباتي", path: "/orders", icon: ListOrdered },
    { name: "حسابي", path: "/account", icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border pb-safe z-50 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {navItems.map((item) => {
          const isActive =
            location === item.path ||
            (item.path !== "/" && location.startsWith(item.path));
          const isCart = item.path === "/cart";
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative cursor-pointer transition-colors ${
                  isActive
                    ? isCart
                      ? "text-rose"
                      : "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  {isCart ? (
                    <div
                      className={`relative ${
                        isActive
                          ? "bg-rose text-white rounded-full p-1.5 -mt-5 shadow-lg ring-4 ring-background"
                          : ""
                      }`}
                    >
                      <item.icon className={`${isActive ? "w-5 h-5" : "w-6 h-6"}`} />
                      {(item.badge ?? 0) > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-rose text-white text-[10px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center shadow-sm">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <item.icon className={`w-6 h-6 ${isActive ? "fill-current opacity-20 stroke-current" : ""}`} />
                      {(item.badge ?? 0) > 0 && (
                        <span className="absolute -top-2 -right-2 bg-rose text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive && isCart ? "text-rose" : ""}`}>
                  {item.name}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 pb-16 lg:pb-0 font-sans">
      <div className="max-w-md mx-auto bg-background min-h-screen relative shadow-sm border-x border-border/50">
        {children}
        <BottomNav />
      </div>
    </div>
  );
}
