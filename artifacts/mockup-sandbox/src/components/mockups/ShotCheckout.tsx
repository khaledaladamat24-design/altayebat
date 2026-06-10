import { ShotFrame } from "./_store-kit";
import src from "../../assets/shots/checkout.jpg";

export default function ShotCheckout() {
  return (
    <ShotFrame
      src={src}
      title="اطلب بثوانٍ — الدفع عند الاستلام"
      subtitle="بدون تسجيل، فقط اسمك وعنوانك"
    />
  );
}
