import { ShotFrame } from "./_store-kit";
import src from "../../assets/shots/home.jpg";

export default function ShotHome() {
  return (
    <ShotFrame
      src={src}
      title="كل ما تحتاجه للحياة الصحية"
      subtitle="أكل صحي، كيتو، ومؤونة بلدية يوصل لباب بيتك"
    />
  );
}
