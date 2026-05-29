import { useListCategories } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/language";
import { LanguageToggle } from "@/components/language-toggle";

export default function Categories() {
  const { lang, dir, tr } = useLanguage();
  const { data: categories, isLoading } = useListCategories();

  return (
    <div className="pb-8" dir={dir}>
      <div className="bg-primary text-primary-foreground pt-12 pb-6 px-4 rounded-b-3xl shadow-sm relative z-10 flex items-center gap-4">
        <Link href="/">
          <div className="bg-primary-foreground/20 p-2 rounded-full cursor-pointer hover:bg-primary-foreground/30 transition">
            <ChevronRight className="w-5 h-5" />
          </div>
        </Link>
        <h1 className="text-xl font-bold flex-1">{tr("جميع الأقسام", "All Categories")}</h1>
        <LanguageToggle />
      </div>

      <div className="px-4 mt-6">
        <div className="grid grid-cols-2 gap-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-square rounded-2xl" />
            ))
          ) : (
            categories?.map((cat) => {
              const name = lang === "en" ? (cat.name || cat.nameAr) : cat.nameAr;
              return (
                <Link key={cat.id} href={`/category/${cat.id}`}>
                  <div className="bg-card border border-card-border rounded-2xl overflow-hidden hover-elevate cursor-pointer aspect-square flex flex-col items-center justify-center p-4 text-center group">
                    <div className="w-20 h-20 mb-3 rounded-full bg-secondary/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 overflow-hidden">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={name} className="w-full h-full object-contain p-2" />
                      ) : (
                        <span className="text-3xl">{cat.icon}</span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm">{name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cat.productCount} {tr("منتج", cat.productCount === 1 ? "product" : "products")}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
