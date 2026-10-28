// Shared by the browser and the api: phone numbers in +61… (E.164) form.

/** Australian numbers to +61 form; numbers that already have a country code are kept. */
export function toE164(raw: string): string | null {
  const s = (raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (s.startsWith("00")) return /^00\d{8,15}$/.test(s) ? `+${s.slice(2)}` : null;
  if (s.startsWith("61") && s.length === 11) return `+${s}`;
  if (s.startsWith("0") && s.length === 10) return `+61${s.slice(1)}`;
  if (s.length === 9 && /^[2-578]/.test(s)) return `+61${s}`;
  return null;
}
