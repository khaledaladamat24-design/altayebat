import { useLocation } from "wouter";
import { ChevronRight, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "1. المعلومات التي نجمعها",
    content: [
      "**المستهلك:** رقم الهاتف (للتوثيق عبر OTP)، الاسم، والموقع الجغرافي لتسهيل توصيل الطلبات.",
      "**المورد:** الاسم، اسم المتجر، رقم الهاتف، الموقع، تفاصيل الحساب المالي المباشر (كليك CliQ، رقم المحفظة الإلكترونية، أو الحساب البنكي).",
      "**بيانات المعاملات:** تفاصيل الطلبات، الأسعار، وإشعارات الدفع (Screenshots) التي يرفعها المستهلك لإثبات التحويل المباشر.",
      "**بيانات الموقع:** نظام تحديد المواقع GPS لعرض المطابخ القريبة وحساب مسافات التوصيل.",
    ],
  },
  {
    title: "2. كيف نستخدم معلوماتك",
    content: [
      "ربط المستهلكين بالموردين المناسبين بشكل ذكي.",
      "تسهيل الدفع المباشر: عرض بيانات المورد المالية للمستهلك لإتمام التحويل دون تدخل مالي من التطبيق.",
      "تمكين الإدارة (khaledaladamat24@gmail.com) من مراقبة المنتجات وتعديلها لضمان جودة المحتوى.",
    ],
  },
  {
    title: "3. مشاركة البيانات وإخلاء المسؤولية",
    content: [
      "يتم مشاركة موقع المستهلك ورقم هاتفه مع المورد لإتمام وتوصيل الطلب.",
      "يتم إرسال رقم الهاتف إلى خدمة Firebase لغايات التحقق عبر رمز الـ OTP فقط.",
      "تطبيق \"الطيبات\" هو وسيط تقني مجاني ولا يتقاضى عمولات حالياً.",
      "الموردون مسؤولون قانونياً عن جودة الأغذية وامتلاكهم التراخيص والشهادات الصحية اللازمة من الجهات الرسمية (مؤسسة الغذاء والدواء وأمانة عمان).",
    ],
  },
  {
    title: "4. حقوق المستخدم والمسؤول",
    content: [
      "يحق للمستخدمين (مستهلكين وموردين) تعديل بياناتهم الشخصية أو طلب حذف حساباتهم في أي وقت.",
      "يمتلك الحساب (khaledaladamat24@gmail.com) الصلاحية المطلقة والكاملة (Admin Access) لتعديل أو حذف أي منتج، وجبة، أو حساب ينتهك شروط الاستخدام.",
    ],
  },
  {
    title: "5. أمن البيانات",
    content: [
      "نطبق إجراءات أمنية وتقنية صارمة لحماية بياناتك المخزنة على خوادم Replit.",
      "التحقق الآمن عبر Firebase يستخدم معايير تشفير متقدمة.",
    ],
  },
];

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto" dir="rtl">
      <div className="bg-primary text-primary-foreground pt-10 pb-5 px-4 rounded-b-3xl">
        <button onClick={() => setLocation(-1 as unknown as string)} className="p-2 -mr-2 mb-2">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">سياسة الخصوصية</h1>
            <p className="text-primary-foreground/70 text-xs">تاريخ آخر تحديث: 26 مايو 2026</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
          <p className="text-sm leading-relaxed text-foreground">
            أهلاً بك في تطبيق <strong>"الطيبات"</strong>. نحن نولي أهمية قصوى لخصوصية بياناتك وأمانها. توضح هذه السياسة كيفية جمع البيانات، استخدامها، ومشاركتها عند استخدامك للتطبيق داخل المملكة الأردنية الهاشمية.
          </p>
        </div>

        {sections.map((section) => (
          <div key={section.title} className="space-y-3">
            <h2 className="font-black text-base text-primary">{section.title}</h2>
            <ul className="space-y-2">
              {section.content.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
                  <span className="text-primary mt-1 shrink-0">•</span>
                  <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="bg-muted rounded-2xl p-4">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            بتحميلك واستخدامك لتطبيق "الطيبات"، فإنك توافق على شروط سياسة الخصوصية هذه.
          </p>
        </div>
      </div>
    </div>
  );
}
