import { useRef, useState } from "react";
import { Upload, Loader2, X, ImageIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { apiUrl } from "@/lib/api-url";
import { useLanguage } from "@/contexts/language";

interface Props {
  value: string;
  onChange: (url: string) => void;
  /** Cloudinary folder override. Defaults to "altayebat_menu_images". */
  folder?: string;
  label?: string;
  /** Optimization transformations baked into the saved URL. */
  transform?: string;
}

interface SignaturePayload {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
  uploadUrl: string;
}

/**
 * File-input replacement for a Cloudinary image URL.
 * – Asks the server for a one-shot signature.
 * – Uploads the file directly to Cloudinary using XHR so we get real progress events.
 * – Rewrites the returned secure_url with `f_auto,q_auto,w_800` for an
 *   automatically-optimized delivery URL, then bubbles it up via `onChange`.
 */
export function ImageUpload({
  value,
  onChange,
  folder = "altayebat_menu_images",
  label,
  transform = "f_auto,q_auto,w_800",
}: Props) {
  const { tr } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const resolvedLabel = label ?? tr("صورة المنتج", "Product image");

  const optimize = (secureUrl: string): string => {
    // Cloudinary URLs look like: https://res.cloudinary.com/<cloud>/image/upload/v123/folder/file.jpg
    // We inject /<transform>/ right after /upload/.
    if (!transform || secureUrl.includes(`/upload/${transform}/`))
      return secureUrl;
    return secureUrl.replace("/image/upload/", `/image/upload/${transform}/`);
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(tr("الرجاء اختيار ملف صورة", "Please select an image file"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(
        tr("الحد الأقصى للصورة 10 ميغابايت", "Maximum image size is 10 MB"),
      );
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      // Compress/resize in the browser before uploading so Cloudinary stores a
      // lightweight file instead of the full-size camera photo. GIFs are skipped
      // to preserve animation; any failure falls back to the original file.
      let uploadFile: File = file;
      if (file.type !== "image/gif") {
        try {
          uploadFile = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
            initialQuality: 0.8,
            fileType: "image/webp",
          });
        } catch {
          uploadFile = file;
        }
      }

      const sigRes = await fetch(apiUrl("/api/uploads/cloudinary-signature"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      if (!sigRes.ok) throw new Error("Failed to obtain upload signature");
      const sig: SignaturePayload = await sigRes.json();

      const form = new FormData();
      const uploadName =
        uploadFile === file
          ? file.name
          : file.name.replace(/\.[^./\\]+$/, "") + ".webp";
      form.append("file", uploadFile, uploadName);
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("folder", sig.folder);
      form.append("signature", sig.signature);

      // XHR (not fetch) so we can wire progress events into the UI.
      const secureUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", sig.uploadUrl);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable)
            setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText) as {
                secure_url?: string;
                error?: { message: string };
              };
              if (json.secure_url) resolve(json.secure_url);
              else
                reject(
                  new Error(
                    json.error?.message || "Cloudinary returned no URL",
                  ),
                );
            } catch (e) {
              reject(e as Error);
            }
          } else {
            reject(new Error(`Cloudinary upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(form);
      });

      onChange(optimize(secureUrl));
      toast.success(tr("تم رفع الصورة", "Image uploaded"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : tr("فشل رفع الصورة", "Image upload failed"),
      );
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        {resolvedLabel}
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />

      {value && !uploading ? (
        <div className="relative group rounded-xl overflow-hidden border-2 border-border bg-muted">
          <img
            src={value}
            alt={tr("معاينة", "Preview")}
            className="w-full h-44 object-cover"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="bg-white text-foreground text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-lg"
            >
              <Upload className="w-3.5 h-3.5" /> {tr("استبدال", "Replace")}
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="bg-destructive text-destructive-foreground text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-lg"
            >
              <X className="w-3.5 h-3.5" /> {tr("إزالة", "Remove")}
            </button>
          </div>
          <div className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
            <CheckCircle2 className="w-3 h-3" /> {tr("تم الرفع", "Uploaded")}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          disabled={uploading}
          className={`relative w-full rounded-xl border-2 border-dashed transition-all overflow-hidden ${
            uploading
              ? "border-primary bg-primary/5 cursor-wait"
              : "border-border bg-muted/30 hover:border-primary hover:bg-primary/5 cursor-pointer"
          }`}
        >
          <div className="py-8 px-4 flex flex-col items-center justify-center gap-2">
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm font-bold text-primary">
                  {tr("جاري رفع الصورة...", "Uploading image...")}
                </p>
                <p className="text-xs text-muted-foreground">{progress}%</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-bold">
                  📸 {tr("رفع صورة الطعام", "Upload food photo")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {tr(
                    "PNG · JPG · WEBP — حتى 10MB",
                    "PNG · JPG · WEBP — up to 10MB",
                  )}
                </p>
              </>
            )}
          </div>
          {uploading && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </button>
      )}
    </div>
  );
}
