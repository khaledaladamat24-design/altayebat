import { useLocation } from "wouter";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/language";

export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();
  const { dir, tr } = useLanguage();

  const sections = [
    {
      title: tr("1. المعلومات التي نجمعها", "1. Information We Collect"),
      content: [
        tr(
          "**المستهلك:** رقم الهاتف (للتوثيق عبر OTP)، الاسم، والموقع الجغرافي لتسهيل توصيل الطلبات.",
          "**Consumer:** Phone number (for OTP verification), name, and location to facilitate order delivery.",
        ),
        tr(
          "**المورد:** الاسم، اسم المتجر، رقم الهاتف، الموقع، تفاصيل الحساب المالي المباشر (كليك CliQ، رقم المحفظة الإلكترونية، أو الحساب البنكي).",
          "**Vendor:** Name, store name, phone number, location, and direct payment details (CliQ, e-wallet number, or bank account).",
        ),
        tr(
          "**بيانات المعاملات:** تفاصيل الطلبات، الأسعار، وإشعارات الدفع (Screenshots) التي يرفعها المستهلك لإثبات التحويل المباشر.",
          "**Transaction data:** Order details, prices, and payment screenshots uploaded by consumers as proof of direct transfer.",
        ),
        tr(
          "**بيانات الموقع:** نظام تحديد المواقع GPS لعرض المطابخ القريبة وحساب مسافات التوصيل.",
          "**Location data:** GPS to display nearby kitchens and compute delivery distances.",
        ),
      ],
    },
    {
      title: tr("2. كيف نستخدم معلوماتك", "2. How We Use Your Information"),
      content: [
        tr(
          "ربط المستهلكين بالموردين المناسبين بشكل ذكي.",
          "Smartly connecting consumers with the right vendors.",
        ),
        tr(
          "تسهيل الدفع المباشر: عرض بيانات المورد المالية للمستهلك لإتمام التحويل دون تدخل مالي من التطبيق.",
          "Facilitating direct payments: showing vendor payment details to consumers so transfers happen without the app handling money.",
        ),
        tr(
          "تمكين الإدارة (khaledaladamat24@gmail.com) من مراقبة المنتجات وتعديلها لضمان جودة المحتوى.",
          "Enabling administration (khaledaladamat24@gmail.com) to monitor and edit products to ensure content quality.",
        ),
      ],
    },
    {
      title: tr("3. مشاركة البيانات وإخلاء المسؤولية", "3. Data Sharing and Disclaimer"),
      content: [
        tr(
          "يتم مشاركة موقع المستهلك ورقم هاتفه مع المورد لإتمام وتوصيل الطلب.",
          "The consumer's location and phone number are shared with the vendor to complete and deliver the order.",
        ),
        tr(
          "يتم إرسال رقم الهاتف إلى خدمة Firebase لغايات التحقق عبر رمز الـ OTP فقط.",
          "Phone numbers are sent to Firebase solely for OTP verification.",
        ),
        tr(
          "تطبيق \"الطيبات\" هو وسيط تقني مجاني ولا يتقاضى عمولات حالياً.",
          "\"Al-Tayebat\" is a free technical intermediary and currently charges no commissions.",
        ),
        tr(
          "الموردون مسؤولون قانونياً عن جودة الأغذية وامتلاكهم التراخيص والشهادات الصحية اللازمة من الجهات الرسمية (مؤسسة الغذاء والدواء وأمانة عمان).",
          "Vendors are legally responsible for food quality and for holding the required licenses and health certifications from official authorities (Jordan Food and Drug Administration and the Greater Amman Municipality).",
        ),
      ],
    },
    {
      title: tr("4. حقوق المستخدم والمسؤول", "4. User and Administrator Rights"),
      content: [
        tr(
          "يحق للمستخدمين (مستهلكين وموردين) تعديل بياناتهم الشخصية أو طلب حذف حساباتهم في أي وقت.",
          "Users (consumers and vendors) may edit their personal data or request account deletion at any time.",
        ),
        tr(
          "يمتلك الحساب (khaledaladamat24@gmail.com) الصلاحية المطلقة والكاملة (Admin Access) لتعديل أو حذف أي منتج، وجبة، أو حساب ينتهك شروط الاستخدام.",
          "The account (khaledaladamat24@gmail.com) holds full administrative access to edit or delete any product, meal, or account that violates the terms of use.",
        ),
      ],
    },
    {
      title: tr("5. أمن البيانات", "5. Data Security"),
      content: [
        tr(
          "نطبق إجراءات أمنية وتقنية صارمة لحماية بياناتك المخزنة على خوادم Replit.",
          "We apply strict security and technical measures to protect your data stored on Replit servers.",
        ),
        tr(
          "التحقق الآمن عبر Firebase يستخدم معايير تشفير متقدمة.",
          "Secure verification via Firebase uses advanced encryption standards.",
        ),
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto" dir={dir}>
      <div className="bg-primary text-primary-foreground pt-10 pb-5 px-4 rounded-b-3xl">
        <button onClick={() => setLocation(-1 as unknown as string)} className="p-2 -mr-2 mb-2">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">{tr("سياسة الخصوصية", "Privacy Policy")}</h1>
            <p className="text-primary-foreground/70 text-xs">{tr("تاريخ آخر تحديث: 26 مايو 2026", "Last updated: May 26, 2026")}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
          <p className="text-sm leading-relaxed text-foreground">
            {tr(
              "أهلاً بك في تطبيق ",
              "Welcome to the ",
            )}
            <strong>{tr("\"الطيبات\"", "\"Al-Tayebat\"")}</strong>
            {tr(
              ". نحن نولي أهمية قصوى لخصوصية بياناتك وأمانها. توضح هذه السياسة كيفية جمع البيانات، استخدامها، ومشاركتها عند استخدامك للتطبيق داخل المملكة الأردنية الهاشمية.",
              " app. We take the privacy and security of your data very seriously. This policy explains how data is collected, used, and shared when you use the app within the Hashemite Kingdom of Jordan.",
            )}
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
            {tr(
              "بتحميلك واستخدامك لتطبيق \"الطيبات\"، فإنك توافق على شروط سياسة الخصوصية هذه.",
              "By downloading and using the \"Al-Tayebat\" app, you agree to the terms of this privacy policy.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
