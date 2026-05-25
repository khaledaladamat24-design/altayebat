import { useGetCart, useCreateOrder, getGetCartQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/utils";
import { useSession } from "@/hooks/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useEffect } from "react";
import { MapPicker } from "@/components/map-picker";

const formSchema = z.object({
  customerName: z.string().min(2, { message: "الاسم يجب أن يكون حرفين على الأقل" }),
  customerPhone: z.string().min(10, { message: "رقم الهاتف غير صحيح" }),
  deliveryAddress: z.string().min(10, { message: "الرجاء إدخال عنوان واضح للتوصيل" }),
  notes: z.string().optional(),
});

export default function Checkout() {
  const [, setLocation] = useLocation();
  const sessionId = useSession();
  const queryClient = useQueryClient();
  
  const { data: cart, isLoading } = useGetCart(
    { sessionId }, 
    { query: { enabled: !!sessionId } }
  );

  const createOrder = useCreateOrder();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: localStorage.getItem('al_tayebat_name') || "",
      customerPhone: localStorage.getItem('al_tayebat_phone') || "",
      deliveryAddress: localStorage.getItem('al_tayebat_address') || "",
      notes: "",
    },
  });

  useEffect(() => {
    if (cart && cart.items.length === 0 && !createOrder.isSuccess) {
      setLocation("/cart");
    }
  }, [cart, setLocation, createOrder.isSuccess]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!sessionId || !cart || cart.items.length === 0) return;

    // Save info for next time
    localStorage.setItem('al_tayebat_name', values.customerName);
    localStorage.setItem('al_tayebat_phone', values.customerPhone);
    localStorage.setItem('al_tayebat_address', values.deliveryAddress);

    createOrder.mutate(
      { 
        data: { 
          ...values, 
          sessionId 
        } 
      },
      {
        onSuccess: (order) => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
          toast.success("تم تأكيد طلبك بنجاح!");
          setLocation(`/orders/${order.id}`);
        },
        onError: () => {
          toast.error("حدث خطأ أثناء إنشاء الطلب. يرجى المحاولة مرة أخرى.");
        }
      }
    );
  };

  if (isLoading || !cart) {
    return <div className="p-8 text-center">جاري التحميل...</div>;
  }

  return (
    <div className="pb-8 min-h-screen bg-muted/30">
      <div className="bg-background pt-8 pb-4 px-4 sticky top-0 z-20 border-b border-border/50 flex items-center gap-4">
        <Link href="/cart">
          <div className="p-2 -mr-2 text-foreground cursor-pointer">
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-xl font-bold">إتمام الطلب</h1>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
            بيانات التوصيل
          </h2>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="checkout-form">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم الكامل</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: أحمد محمد" className="h-12 bg-muted border-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الهاتف</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: 0791234567" dir="ltr" className="h-12 bg-muted border-none text-right" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between mb-1">
                      <FormLabel>عنوان التوصيل</FormLabel>
                      <MapPicker
                        onAddressSelect={(address) => {
                          field.onChange(address);
                          localStorage.setItem("al_tayebat_address", address);
                        }}
                      />
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="المدينة، المنطقة، الشارع، رقم العمارة، رقم الشقة"
                        className="min-h-[90px] bg-muted border-none resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ملاحظات إضافية (اختياري)</FormLabel>
                    <FormControl>
                      <Input placeholder="مثال: يرجى الاتصال عند الوصول" className="h-12 bg-muted border-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
            طريقة الدفع
          </h2>
          
          <div className="border border-primary bg-primary/5 rounded-xl p-4 flex items-center gap-3">
            <div className="bg-primary text-primary-foreground rounded-full p-1">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold">الدفع عند الاستلام</p>
              <p className="text-sm text-muted-foreground">ادفع نقداً عند استلام طلبك</p>
            </div>
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl shadow-sm border border-border">
          <h2 className="font-bold text-lg mb-4">ملخص الطلب</h2>
          
          <div className="space-y-3">
            {cart.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground flex-1 pr-4">{item.quantity} × {item.productNameAr}</span>
                <span className="font-medium whitespace-nowrap">{formatPrice(item.totalPrice)}</span>
              </div>
            ))}
          </div>
          
          <div className="border-t border-border my-4"></div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="font-medium">{formatPrice(cart.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">رسوم التوصيل</span>
              <span className="font-medium">
                {cart.deliveryFee === 0 ? 'مجاني' : formatPrice(cart.deliveryFee)}
              </span>
            </div>
            
            <div className="border-t border-border mt-3 pt-3"></div>
            
            <div className="flex justify-between items-center text-lg font-bold">
              <span>الإجمالي المطلوب</span>
              <span className="text-primary">{formatPrice(cart.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border z-50 max-w-md mx-auto">
        <Button 
          type="submit" 
          form="checkout-form"
          className="w-full h-14 rounded-full text-lg shadow-lg" 
          disabled={createOrder.isPending}
        >
          {createOrder.isPending ? 'جاري التأكيد...' : 'تأكيد الطلب'}
        </Button>
      </div>
    </div>
  );
}
