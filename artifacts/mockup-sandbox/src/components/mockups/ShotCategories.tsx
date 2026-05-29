import { ShotFrame } from "./_store-kit";
import src from "../../assets/shots/categories.jpg";

export default function ShotCategories() {
  return (
    <ShotFrame
      src={src}
      title="تصفّح أقسامنا المتنوعة"
      subtitle="من الكيتو إلى الخضار العضوية والمؤونة الصحية"
    />
  );
}
