import { ShotFrame } from "./_store-kit";
import src from "../../assets/shots/cart.jpg";

export default function ShotCart() {
  return (
    <ShotFrame
      src={src}
      title="سلة تسوّق سهلة وسريعة"
      subtitle="توصيل مجاني للطلبات فوق ٢٠ ديناراً"
    />
  );
}
