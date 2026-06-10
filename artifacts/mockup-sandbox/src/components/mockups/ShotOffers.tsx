import { ShotFrame } from "./_store-kit";
import src from "../../assets/shots/offers.jpg";

export default function ShotOffers() {
  return (
    <ShotFrame
      src={src}
      title="عروض وتخفيضات يومية"
      subtitle="وفّر أكثر على منتجاتك الصحية المفضلة"
    />
  );
}
