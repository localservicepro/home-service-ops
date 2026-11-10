// Shared (client + server): website enquiry form configuration.

export type FieldKey = "name" | "email" | "phone" | "address" | "service" | "notes" | "photos";
export type FieldSetting = { show: boolean; required: boolean };

export type LeadFormConfig = {
  title: string;
  subtitle: string;
  buttonText: string;
  successMessage: string;
  color: string;
  logoUrl: string | null;
  showBusinessName: boolean;
  fields: Record<FieldKey, FieldSetting>;
  /** Services customers can pick. null = every active service. */
  serviceIds: number[] | null;
  /** Let customers tick more than one service. */
  multiService: boolean;
};

export const FIELD_LABELS: Record<FieldKey, { label: string; hint: string }> = {
  name: { label: "Name", hint: "Customer's full name" },
  email: { label: "Email", hint: "For your quote and updates" },
  phone: { label: "Phone", hint: "Mobile number" },
  address: { label: "Property address", hint: "Where the work is" },
  service: { label: "Service needed", hint: "From your Services list" },
  notes: { label: "Notes", hint: "Details about the job" },
  photos: { label: "Photos", hint: "Up to 5 images" },
};
export const FIELD_ORDER: FieldKey[] = ["name", "email", "phone", "address", "service", "notes", "photos"];
export const MAX_PHOTOS = 5;

export const DEFAULT_CONFIG: LeadFormConfig = {
  title: "Get a free quote",
  subtitle: "Tell us about the job and we'll get back to you with a quote.",
  buttonText: "Request a quote",
  successMessage: "Thanks! We've got your request and will be in touch shortly.",
  color: "#0C6FD0",
  logoUrl: null,
  showBusinessName: true,
  fields: {
    name: { show: true, required: true },
    email: { show: true, required: true },
    phone: { show: true, required: true },
    address: { show: true, required: true },
    service: { show: true, required: false },
    notes: { show: true, required: false },
    photos: { show: true, required: false },
  },
  serviceIds: null,
  multiService: true,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.slice(0, max) : fallback);

/** Fills in defaults and drops anything unexpected. Name is always shown and required. */
export function normalizeConfig(raw: unknown): LeadFormConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LeadFormConfig>;
  const fields = { ...DEFAULT_CONFIG.fields };
  for (const k of FIELD_ORDER) {
    const f = r.fields?.[k];
    if (f && typeof f === "object") fields[k] = { show: !!f.show, required: !!f.show && !!f.required };
  }
  fields.name = { show: true, required: true };
  if (!fields.email.show && !fields.phone.show) fields.phone = { show: true, required: true };
  return {
    title: str(r.title, 80, DEFAULT_CONFIG.title),
    subtitle: str(r.subtitle, 240, DEFAULT_CONFIG.subtitle),
    buttonText: str(r.buttonText, 40, DEFAULT_CONFIG.buttonText) || DEFAULT_CONFIG.buttonText,
    successMessage: str(r.successMessage, 300, DEFAULT_CONFIG.successMessage) || DEFAULT_CONFIG.successMessage,
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color : DEFAULT_CONFIG.color,
    logoUrl: typeof r.logoUrl === "string" && /^(https:\/\/|\/_cdn\/)[^"'<>\s]+$/.test(r.logoUrl) ? r.logoUrl.slice(0, 600) : null,
    showBusinessName: r.showBusinessName !== false,
    fields,
    serviceIds: Array.isArray(r.serviceIds) ? r.serviceIds.filter((n): n is number => Number.isInteger(n)).slice(0, 100) : null,
    multiService: r.multiService !== false,
  };
}

/** Readable text colour (white or dark) on top of the brand colour. */
export function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#0B1B2E" : "#FFFFFF";
}

export type PublicLeadForm = {
  key: string;
  businessName: string;
  config: LeadFormConfig;
  services: { id: number; name: string }[];
};

