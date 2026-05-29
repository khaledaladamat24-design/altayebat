import { ShotFrame } from "./_store-kit";
import src from "../../assets/shots/product.jpg";

export default function ShotProduct() {
  return (
    <ShotFrame
      src={src}
      title="تفاصيل كل منتج بين يديك"
      subtitle="صور واضحة، أسعار، وأوصاف لكل صنف"
    />
  );
}
