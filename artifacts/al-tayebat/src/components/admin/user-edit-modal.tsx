import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";

export interface EditableUser {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
}

interface Props {
  user: EditableUser;
  adminHeaders: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditModal({ user, adminHeaders, onClose, onSaved }: Props) {
  const { tr, dir } = useLanguage();
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${user.id}`), {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          name: name.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          role,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || tr("فشل حفظ التعديلات", "Failed to save"));
        return;
      }
      toast.success(tr("تم حفظ التعديلات", "Changes saved"));
      onSaved();
      onClose();
    } catch {
      toast.error(tr("فشل حفظ التعديلات", "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      dir={dir}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {tr("تعديل المستخدم", "Edit user")}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              {tr("الاسم", "Name")}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              {tr("رقم الهاتف", "Phone")}
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              {tr("البريد الإلكتروني", "Email")}
            </label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground">
              {tr("الدور", "Role")}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="consumer">{tr("مستهلك", "Consumer")}</option>
              <option value="vendor">{tr("مورّد", "Vendor")}</option>
              <option value="admin">{tr("أدمن", "Admin")}</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? tr("جارٍ الحفظ...", "Saving...") : tr("حفظ", "Save")}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {tr("إلغاء", "Cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
