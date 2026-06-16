import honey from '@assets/food-src/honey.png';
import keto from '@assets/food-src/keto.png';
import nuts from '@assets/food-src/nuts.png';
import juice from '@assets/food-src/juice.png';
import peanut from '@assets/food-src/peanut.png';
import dates from '@assets/food-src/dates.png';

type Offer = {
  name: string;
  img: string;
  price: string;
  original: string;
  tag: string;
};

const OFFERS: Offer[] = [
  { name: 'عسل طبيعي نقي', img: honey, price: '9.500', original: '11.000', tag: 'عضوي' },
  { name: 'سلطة كيتو طازجة', img: keto, price: '7.500', original: '9.000', tag: 'كيتو' },
  { name: 'مكسرات مشكلة فاخرة', img: nuts, price: '12.000', original: '15.000', tag: 'عضوي' },
  { name: 'عصير ديتوكس أخضر', img: juice, price: '4.500', original: '6.000', tag: 'كيتو' },
  { name: 'زبدة فول سوداني', img: peanut, price: '6.000', original: '8.000', tag: 'كيتو' },
  { name: 'تمر مجفف فاخر', img: dates, price: '8.000', original: '10.000', tag: 'عضوي' },
];

export function OffersScreen() {
  return (
    <div className="w-full h-full bg-[#f4fbf4] flex flex-col" dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif' }}>
      {/* Header */}
      <div className="bg-[#29A366] text-white px-4 pt-5 pb-4 rounded-b-3xl flex items-center justify-between shadow-md">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">‹</div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black m-0">عروض صحية</h2>
          <span className="text-lg">٪</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 px-3 py-3 overflow-hidden">
        <span className="bg-[#29A366] text-white text-[11px] font-bold rounded-full px-3 py-1">الكل</span>
        <span className="bg-white text-[#475569] text-[11px] font-bold rounded-full px-3 py-1 border border-gray-200">كيتو</span>
        <span className="bg-white text-[#475569] text-[11px] font-bold rounded-full px-3 py-1 border border-gray-200">عضوي</span>
        <span className="bg-white text-[#475569] text-[11px] font-bold rounded-full px-3 py-1 border border-gray-200">متوفر فقط</span>
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-2 gap-2.5 px-3 pb-2 content-start overflow-hidden">
        {OFFERS.map((o) => (
          <div key={o.name} className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex flex-col">
            <span className="absolute top-2 right-2 z-10 bg-[#29A366] text-white text-[9px] font-bold rounded-full px-2 py-0.5">{o.tag}</span>
            <span className="absolute top-2 left-2 z-10 bg-rose-500 text-white text-[9px] font-bold rounded-full px-2 py-0.5">عرض</span>
            <div className="h-[64px] flex items-center justify-center mt-3 mb-1">
              <img src={o.img} alt={o.name} className="h-full w-full object-contain" />
            </div>
            <p className="text-[#064e3b] font-bold text-[12px] text-right leading-tight m-0 mb-1 truncate">{o.name}</p>
            <div className="flex items-end justify-between mt-auto">
              <div className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm font-bold leading-none">+</div>
              <div className="text-right">
                <div className="text-[#29A366] font-black text-[13px] leading-none">{o.price} <span className="text-[10px]">د.أ</span></div>
                <div className="text-gray-400 text-[9px] line-through leading-none mt-0.5">{o.original}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-gray-100 flex justify-around items-center py-2 text-[9px] text-[#475569]">
        {['حسابي', 'طلباتي', 'السلة', 'الأقسام', 'الرئيسية'].map((t, i) => (
          <div key={t} className={`flex flex-col items-center gap-0.5 ${i === 4 ? 'text-[#29A366] font-bold' : ''}`}>
            <div className="w-4 h-4 rounded-sm border border-current" />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
