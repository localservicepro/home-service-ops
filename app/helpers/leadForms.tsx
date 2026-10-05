import { pricing } from "./pricing";
import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { upload } from "./storage";
import { db } from "./db";
import { ensureClient } from "./ensureClient";
import { businessBrand, esc, layout, PUBLIC_APP_URL, sendAppEmail } from "./mailer";
import { FIELD_ORDER, MAX_PHOTOS, normalizeConfig, type LeadFormConfig, type PublicLeadForm } from "./leadFormConfig";

// Server-only. Website enquiry form: config per business, public submissions → client + "New" request.

const SUBMITS_PER_HOUR = 8;
const UPLOADS_PER_HOUR = 40;

export async function getOrCreateForm(businessId: number) {
  let f = await db.selectFrom("leadForms").selectAll().where("businessId", "=", businessId).executeTakeFirst();
  if (!f) {
    f = await db
      .insertInto("leadForms")
      .values({ businessId, publicKey: randomBytes(12).toString("base64url"), config: normalizeConfig({}) })
      .onConflict((oc) => oc.column("businessId").doNothing())
      .returningAll()
      .executeTakeFirst();
    if (!f) f = await db.selectFrom("leadForms").selectAll().where("businessId", "=", businessId).executeTakeFirstOrThrow();
  }
  return { ...f, config: normalizeConfig(f.config) };
}

export async function saveForm(businessId: number, patch: { config?: unknown; enabled?: boolean; notifyEmail?: boolean }) {
  await getOrCreateForm(businessId);
  await db
    .updateTable("leadForms")
    .set({
      ...(patch.config !== undefined ? { config: normalizeConfig(patch.config) } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.notifyEmail !== undefined ? { notifyEmail: patch.notifyEmail } : {}),
      updatedAt: new Date(),
    })
    .where("businessId", "=", businessId)
    .execute();
}

export async function presignLogo(businessId: number, contentType: string, sizeBytes: number) {
  const ext = contentType.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
  const res = await upload({ visibility: "public", filename: `form-logos/${businessId}/${nanoid(12)}.${ext}`, contentType, sizeBytes });
  if (!res.ok) throw new Error(res.error.message);
  return { presignedUrl: res.presignedUrl, url: res.url };
}

async function formByKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(key)) return null;
  const f = await db.selectFrom("leadForms").selectAll().where("publicKey", "=", key).executeTakeFirst();
  return f && f.enabled ? { ...f, config: normalizeConfig(f.config) } : null;
}

async function servicesFor(businessId: number, cfg: LeadFormConfig) {
  const all = await db.selectFrom("services").select(["id", "name", "price"]).where("businessId", "=", businessId).where("active", "=", true).orderBy("name").execute();
  return cfg.serviceIds ? all.filter((s) => cfg.serviceIds!.includes(s.id)) : all;
}

export async function publicForm(key: string): Promise<PublicLeadForm> {
  const f = await formByKey(key);
  if (!f) throw new Error("This form isn't available.");
  const [brand, services] = await Promise.all([businessBrand(f.businessId), servicesFor(f.businessId, f.config)]);
  return { key, businessName: brand.name, config: f.config, services: services.map((s) => ({ id: s.id, name: s.name })) };
}

const ipHash = (request: Request) =>
  createHash("sha256")
    .update((request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown")
    .digest("hex")
    .slice(0, 32);

async function rateLimit(businessId: number, hash: string, kind: string, max: number) {
  const since = new Date(Date.now() - 3600_000);
  const r = await db
    .selectFrom("leadFormHits")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("businessId", "=", businessId)
    .where("ipHash", "=", hash)
    .where("kind", "=", kind)
    .where("createdAt", ">=", since)
    .executeTakeFirst();
  if (Number(r?.n ?? 0) >= max) throw new Error("Too many attempts. Please try again later or call us.");
  await db.insertInto("leadFormHits").values({ businessId, ipHash: hash, kind }).execute();
}

export async function presignLeadPhoto(request: Request, key: string, contentType: string, sizeBytes: number) {
  const f = await formByKey(key);
  if (!f || !f.config.fields.photos.show) throw new Error("Photo uploads aren't available on this form.");
  await rateLimit(f.businessId, ipHash(request), "upload", UPLOADS_PER_HOUR);
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const res = await upload({ visibility: "public", filename: `lead-photos/${f.businessId}/${nanoid(18)}.${ext}`, contentType, sizeBytes });
  if (!res.ok) throw new Error(res.error.message);
  return { presignedUrl: res.presignedUrl, url: res.url };
}

export type LeadSubmission = {
  key: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  serviceIds?: number[];
  notes?: string;
  photos?: string[];
  website?: string; // honeypot
  elapsedMs?: number;
};

export async function submitLead(request: Request, input: LeadSubmission) {
  const f = await formByKey(input.key);
  if (!f) throw new Error("This form isn't available.");
  const cfg = f.config;
  // Bots: filled the hidden field or submitted inhumanly fast → pretend success, save nothing.
  if (input.website || (input.elapsedMs !== undefined && input.elapsedMs < 2500)) return { ok: true as const };
  await rateLimit(f.businessId, ipHash(request), "submit", SUBMITS_PER_HOUR);

  const val = {
    name: (input.name ?? "").trim(),
    email: (input.email ?? "").trim().toLowerCase(),
    phone: (input.phone ?? "").trim(),
    address: (input.address ?? "").trim(),
    notes: (input.notes ?? "").trim(),
  };
  for (const k of FIELD_ORDER) {
    const s = cfg.fields[k];
    if (!s.show || !s.required) continue;
    if (k === "service" && !(input.serviceIds ?? []).length) throw new Error("Please choose a service.");
    if (k === "photos" && !(input.photos ?? []).length) throw new Error("Please add at least one photo.");
    if (k in val && !val[k as keyof typeof val]) throw new Error("Please fill in all required fields.");
  }
  if (val.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email)) throw new Error("Please enter a valid email address.");

  const services = cfg.fields.service.show ? await servicesFor(f.businessId, cfg) : [];
  const picked = services.filter((s) => (input.serviceIds ?? []).includes(s.id)).slice(0, cfg.multiService ? 20 : 1);
  // Only accept photos we issued for this business.
  const prefix = `lead-photos/${f.businessId}/`;
  const photos = cfg.fields.photos.show ? (input.photos ?? []).filter((u) => typeof u === "string" && (u.startsWith(`/_cdn/${prefix}`) || (u.startsWith("https://") && u.includes(`/${prefix}`))) && !u.includes("..")).slice(0, MAX_PHOTOS) : [];

  const noteLines = [
    val.notes,
    val.email ? `Email: ${val.email}` : "",
    "— Sent from your website form",
  ].filter(Boolean);
  // One invoice/quote line per chosen service, at today's price (editable later).
  const lines = picked.map((s, i) => ({ id: `w${Date.now()}${i}`, kind: "service" as const, refId: s.id, parentId: null, name: s.name, qty: 1, price: Number(s.price || 0) }));

  const job = await db.transaction().execute(async (trx) => {
    const clientId = await ensureClient(trx, f.businessId, { name: val.name, address: val.address, phone: val.phone });
    if (val.email) {
      await trx.updateTable("clients").set({ email: val.email }).where("id", "=", clientId).where("email", "=", "").execute();
    }
    return trx
      .insertInto("jobs")
      .values({
        businessId: f.businessId,
        clientId,
        customer: val.name.slice(0, 200),
        address: val.address.slice(0, 300),
        phone: val.phone.slice(0, 50),
        service: picked.map((s) => s.name).join(", ").slice(0, 300),
        price: pricing.calcTotals(lines, 0, false).total,
        lines,
        notes: noteLines.join("\n").slice(0, 4000),
        photos,
        status: "New",
        source: "website",
        requestEmail: val.email || null,
      })
      .returning(["id", "num"])
      .executeTakeFirstOrThrow();
  });

  await db
    .updateTable("leadForms")
    .set((eb) => ({ submissions: eb("submissions", "+", 1), lastSubmissionAt: new Date() }))
    .where("businessId", "=", f.businessId)
    .execute();

  // Best-effort side effects.
  try {
    const { pushToLc } = await import("./lcSync");
    await pushToLc(f.businessId, { jobIds: [job.id] });
  } catch {
    /* ignore */
  }
  if (f.notifyEmail) {
    try {
      const brand = await businessBrand(f.businessId);
      if (brand.email) {
        const rows: [string, string][] = [
          ["Name", val.name],
          ["Email", val.email],
          ["Phone", val.phone],
          ["Address", val.address],
          ["Service", picked.map((s) => s.name).join(", ")],
          ["Notes", val.notes],
          ["Photos", photos.length ? `${photos.length} attached` : ""],
        ].filter(([, v]) => v) as [string, string][];
        await sendAppEmail({
          to: brand.email,
          subject: `New quote request from ${val.name}`,
          fromName: "Home Service Ops",
          replyTo: val.email || undefined,
          html: layout({
            brand: brand.name,
            heading: "New website enquiry",
            paragraphs: rows.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v).replace(/\n/g, "<br>")}`),
            cta: { label: "Open in Home Service Ops", url: `${PUBLIC_APP_URL}/jobs/${job.id}` },
          }),
          text: `New website enquiry (${job.num})\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${PUBLIC_APP_URL}/jobs/${job.id}`,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: true as const };
}

