import { useEffect, useState } from "react";
import { Plus, Trash2, Check, X, Pencil, Star, StarOff, Truck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";

interface AdapterType {
  type: string;
  requiredCredentials: Array<{ key: string; label: string; placeholder?: string }>;
}

interface DeliveryProvider {
  id: number;
  code: string;
  name: string;
  nameAr: string;
  type: string;
  baseUrl: string | null;
  enabled: boolean;
  isDefault: boolean;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  hasCredentials: boolean;
  settings: Record<string, unknown>;
}

interface Props { adminHeaders: Record<string, string>; }

export function AdminDeliveryTab({ adminHeaders }: Props) {
  const { lang, tr } = useLanguage();

  const TYPE_LABELS: Record<string, string> = {
    manual: tr("يدوي (بدون API خارجي)", "Manual (no external API)"),
    aramex: tr("Aramex / أرامكس", "Aramex"),
    logix: tr("LogiX / لوجيكس", "LogiX"),
    joeys: "Joey's Express",
    jeds: tr("JEDS / جدوى", "JEDS"),
    talabat: "Talabat Delivery",
    dhl: "DHL Express",
    custom: tr("شركة أخرى (Endpoint مخصص)", "Other (custom endpoint)"),
  };

  const [providers, setProviders] = useState<DeliveryProvider[]>([]);
  const [adapterTypes, setAdapterTypes] = useState<AdapterType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<DeliveryProvider | null>(null);
  const [showForm, setShowForm] = useState(false);

  const blankForm = {
    code: "", name: "", nameAr: "", type: "manual",
    contactPhone: "", contactWhatsapp: "",
    enabled: false, isDefault: false,
    credentials: {} as Record<string, string>,
  };
  const [form, setForm] = useState(blankForm);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, at] = await Promise.all([
        fetch(apiUrl("/api/delivery/providers"), { headers: adminHeaders }).then(r => r.json()),
        fetch(apiUrl("/api/delivery/adapter-types")).then(r => r.json()),
      ]);
      setProviders(Array.isArray(pr) ? pr : []);
      setAdapterTypes(Array.isArray(at) ? at : []);
    } catch { toast.error(tr("فشل تحميل شركات التوصيل", "Failed to load delivery companies")); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const required = adapterTypes.find(a => a.type === form.type)?.requiredCredentials ?? [];

  const submit = async () => {
    if (!form.code || !form.name || !form.nameAr) { toast.error(tr("الرمز والاسم مطلوبان", "Code and name are required")); return; }
    const url = editing
      ? apiUrl(`/api/delivery/providers/${editing.id}`)
      : apiUrl("/api/delivery/providers");
    const method = editing ? "PATCH" : "POST";
    const body: Record<string, unknown> = {
      code: form.code, name: form.name, nameAr: form.nameAr, type: form.type,
      enabled: form.enabled, isDefault: form.isDefault,
      contactPhone: form.contactPhone || null,
      contactWhatsapp: form.contactWhatsapp || null,
    };
    // Only send credentials when at least one was actually filled in this form pass.
    // Avoids accidentally wiping saved creds when editing other fields.
    if (Object.values(form.credentials).some(v => v && v.length > 0)) {
      body.credentials = form.credentials;
    }
    const res = await fetch(url, { method, headers: adminHeaders, body: JSON.stringify(body) });
    if (res.ok) {
      toast.success(editing ? tr("تم التحديث", "Updated") : tr("تمت الإضافة", "Added"));
      setShowForm(false); setEditing(null); setForm(blankForm);
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || tr("فشلت العملية", "Operation failed"));
    }
  };

  const remove = async (p: DeliveryProvider) => {
    const displayName = lang === "en" ? (p.name || p.nameAr) : p.nameAr;
    if (!confirm(tr(`حذف شركة "${displayName}"؟`, `Delete company "${displayName}"?`))) return;
    const res = await fetch(apiUrl(`/api/delivery/providers/${p.id}`), { method: "DELETE", headers: adminHeaders });
    if (res.ok) { toast.success(tr("تم الحذف", "Deleted")); load(); }
    else toast.error(tr("فشل الحذف", "Delete failed"));
  };

  const togglePatch = async (p: DeliveryProvider, patch: Partial<DeliveryProvider>) => {
    const res = await fetch(apiUrl(`/api/delivery/providers/${p.id}`), {
      method: "PATCH", headers: adminHeaders, body: JSON.stringify(patch),
    });
    if (res.ok) load(); else toast.error(tr("فشل", "Failed"));
  };

  const startEdit = (p: DeliveryProvider) => {
    setEditing(p);
    setForm({
      code: p.code, name: p.name, nameAr: p.nameAr, type: p.type,
      contactPhone: p.contactPhone || "", contactWhatsapp: p.contactWhatsapp || "",
      enabled: p.enabled, isDefault: p.isDefault,
      credentials: {},
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-3">
      {!showForm && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {tr(`${providers.length} شركة توصيل مسجّلة`, `${providers.length} delivery companies registered`)}
          </p>
          <Button onClick={() => { setEditing(null); setForm(blankForm); setShowForm(true); }} size="sm" className="gap-1 h-8 text-xs">
            <Plus className="w-4 h-4" /> {tr("إضافة شركة", "Add company")}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-sm">{editing ? tr("تعديل شركة", "Edit company") : tr("إضافة شركة توصيل", "Add a delivery company")}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">{tr("الاسم بالعربي *", "Arabic name *")}</label>
              <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder={tr("أرامكس", "Aramex (Arabic)")} className="h-10 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">{tr("الاسم بالإنجليزي *", "English name *")}</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Aramex" dir="ltr" className="h-10 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">{tr("رمز فريد *", "Unique code *")}</label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="aramex_jo" dir="ltr" className="h-10 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">{tr("نوع الربط", "Integration type")}</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, credentials: {} }))}
                className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md">
                {adapterTypes.map(a => <option key={a.type} value={a.type}>{TYPE_LABELS[a.type] ?? a.type}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">{tr("هاتف الشركة", "Company phone")}</label>
              <Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="0790000000" dir="ltr" className="h-10 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">{tr("واتساب الشركة", "Company WhatsApp")}</label>
              <Input value={form.contactWhatsapp} onChange={e => setForm(f => ({ ...f, contactWhatsapp: e.target.value }))} placeholder="962790000000" dir="ltr" className="h-10 text-sm" />
            </div>
          </div>

          {required.length > 0 && (
            <div className="space-y-2 bg-muted/30 p-3 rounded-lg">
              <p className="text-[11px] font-bold text-muted-foreground">
                {tr(`مفاتيح API المطلوبة لـ ${TYPE_LABELS[form.type]}`, `Required API keys for ${TYPE_LABELS[form.type]}`)}
                {editing?.hasCredentials && <span className="font-normal text-[10px]"> — {tr("اترك الحقول فارغة لإبقاء المفاتيح المحفوظة كما هي", "Leave fields blank to keep the saved keys unchanged")}</span>}
              </p>
              {required.map(r => (
                <div key={r.key}>
                  <label className="text-[10px] text-muted-foreground">{r.label}</label>
                  <Input
                    type="password"
                    value={form.credentials[r.key] ?? ""}
                    onChange={e => setForm(f => ({ ...f, credentials: { ...f.credentials, [r.key]: e.target.value } }))}
                    placeholder={r.placeholder || "•••••••"}
                    dir="ltr"
                    className="h-9 text-sm font-mono"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
              {tr("مفعّلة", "Enabled")}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
              {tr("الشركة الافتراضية", "Default company")}
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={submit} size="sm" className="flex-1 h-9 text-xs gap-1"><Check className="w-3.5 h-3.5" />{editing ? tr("حفظ", "Save") : tr("إضافة", "Add")}</Button>
            <Button onClick={() => { setShowForm(false); setEditing(null); setForm(blankForm); }} variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1"><X className="w-3.5 h-3.5" />{tr("إلغاء", "Cancel")}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-6">{tr("جاري التحميل...", "Loading...")}</p>
      ) : providers.length === 0 && !showForm ? (
        <div className="bg-card rounded-xl border border-dashed border-border p-6 text-center">
          <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-bold mb-1">{tr("لا توجد شركات توصيل بعد", "No delivery companies yet")}</p>
          <p className="text-xs text-muted-foreground">{tr(
            'أضف شركة لربط API الخاص بها مع تطبيقك. ابدأ بـ "يدوي" لو ما عندك مفاتيح لسّا.',
            'Add a company to connect its API to your app. Start with "Manual" if you don\'t have API keys yet.'
          )}</p>
        </div>
      ) : (
        providers.map(p => (
          <div key={p.id} className="bg-card rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold text-sm">{lang === "en" ? (p.name || p.nameAr) : p.nameAr}</p>
                  {p.isDefault && <span className="text-[9px] bg-rose/10 text-rose px-1.5 py-0.5 rounded-full font-bold">{tr("افتراضية", "Default")}</span>}
                  {p.enabled
                    ? <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{tr("مفعّلة", "Enabled")}</span>
                    : <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-bold">{tr("معطّلة", "Disabled")}</span>}
                  {p.hasCredentials
                    ? <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{tr("مفاتيح ✓", "Keys ✓")}</span>
                    : p.type !== "manual" && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{tr("بدون مفاتيح", "No keys")}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {TYPE_LABELS[p.type] ?? p.type} · {p.code}
                </p>
                {p.contactPhone && <p className="text-[11px] text-muted-foreground" dir="ltr">📞 {p.contactPhone}</p>}
              </div>
              <button onClick={() => remove(p)} className="text-destructive p-1.5 hover:bg-destructive/10 rounded-lg" aria-label={tr("حذف", "Delete")}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => togglePatch(p, { enabled: !p.enabled })}
                className={`flex-1 text-[11px] py-1.5 rounded-lg font-bold ${p.enabled ? "bg-muted text-muted-foreground" : "bg-green-600 text-white"}`}>
                {p.enabled ? tr("تعطيل", "Disable") : tr("تفعيل", "Enable")}
              </button>
              <button onClick={() => togglePatch(p, { isDefault: !p.isDefault })}
                className="flex-1 text-[11px] py-1.5 rounded-lg font-bold bg-rose/10 text-rose flex items-center justify-center gap-1">
                {p.isDefault ? <><StarOff className="w-3 h-3" /> {tr("إلغاء كافتراضية", "Unset default")}</> : <><Star className="w-3 h-3" /> {tr("اجعلها افتراضية", "Set as default")}</>}
              </button>
              <button onClick={() => startEdit(p)} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center gap-1">
                <Pencil className="w-3 h-3" /> {tr("تعديل", "Edit")}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
