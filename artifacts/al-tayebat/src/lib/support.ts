export const SUPPORT_PHONE = "0777379506";
const SUPPORT_WHATSAPP = "962777379506";
const SUPPORT_MESSAGE = "مرحباً، أحتاج مساعدة في تطبيق الطيبات";

export function openSupport() {
  const text = encodeURIComponent(SUPPORT_MESSAGE);
  window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`, "_blank");
}

export function callSupport() {
  window.location.href = `tel:${SUPPORT_PHONE}`;
}
