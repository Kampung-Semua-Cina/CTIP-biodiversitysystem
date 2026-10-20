// apps/mobile/components/format.js
// Short dates for lists ("5 Oct") and detail lines ("5 Oct, 10:55"), in the phone's time zone.
// Month names are spelled out here so every phone shows the same thing.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export const shortDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const longDate = (iso) => (iso ? `${shortDate(iso)} ${new Date(iso).getFullYear()}` : '-');

export const dateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${shortDate(iso)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const coords = (lat, lng) => `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
