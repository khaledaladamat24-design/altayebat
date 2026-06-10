import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/language";

export default function NotFound() {
  const { dir, tr } = useLanguage();
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-gray-50"
      dir={dir}
    >
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">
              {tr("404 الصفحة غير موجودة", "404 Page Not Found")}
            </h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            {tr(
              "هل نسيت إضافة الصفحة إلى الموجِّه؟",
              "Did you forget to add the page to the router?",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
