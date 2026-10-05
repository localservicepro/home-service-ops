import { db } from "./db";
import { APP_URL, env } from "./serverEnv";

// Server-only. Branded transactional email via Resend. Sends from hello@EMAIL_DOMAIN with the
// business's name as the sender and replies going to the business's own inbox.
// The domain must be verified in Resend (SPF + DKIM) before mail reaches real inboxes.

export const SEND_DOMAIN = env("EMAIL_DOMAIN") ?? "localservicepro.com.au";

// Customer-facing links always use the configured app URL, never the request's origin,
// so a preview build or localhost can't leak into a customer email.
export const PUBLIC_APP_URL = APP_URL;
export function linkBase(_origin?: string) {
  return APP_URL;
}

export const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function isValidOrigin(o: string) {
  return /^https:\/\/[^/]+$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
}

type Brand = { name: string; email: string; phone: string };

export async function businessBrand(businessId: number): Promise<Brand> {
  const [b, s, owner] = await Promise.all([
    db.selectFrom("businesses").select("name").where("id", "=", businessId).executeTakeFirstOrThrow(),
    db.selectFrom("settings").select("business").where("businessId", "=", businessId).executeTakeFirst(),
    db
      .selectFrom("memberships")
      .innerJoin("users", "users.id", "memberships.userId")
      .select("users.email")
      .where("memberships.businessId", "=", businessId)
      .where("memberships.role", "=", "owner")
      .executeTakeFirst(),
  ]);
  const info = (s?.business ?? {}) as { name?: string; email?: string; phone?: string };
  return { name: info.name || b.name, email: info.email || owner?.email || "", phone: info.phone || "" };
}

/** Simple, mobile-friendly email body with an optional call-to-action button. */
export function layout(opts: { brand: string; heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer?: string }) {
  const ps = opts.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#33475e">${p}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:22px 0"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#0C6FD0;background-image:linear-gradient(135deg,#0C6FD0,#35C6F4);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px">${esc(opts.cta.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12px;color:#7a8ba0">Or open this link: <a href="${esc(opts.cta.url)}" style="color:#0C6FD0;word-break:break-all">${esc(opts.cta.url)}</a></p>`
    : "";
  return [
    `<!doctype html><html><body style="margin:0;background:#F4F8FC;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8FC;padding:24px 12px"><tr><td align="center">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #DCE6F2">`,
    `<tr><td style="background:#08172B;padding:18px 24px;color:#fff;font-weight:800;font-size:17px">${esc(opts.brand)}</td></tr>`,
    `<tr><td style="padding:26px 24px 10px"><h1 style="margin:0 0 16px;font-size:21px;color:#08172B">${esc(opts.heading)}</h1>${ps}${cta}</td></tr>`,
    `<tr><td style="padding:14px 24px 22px;font-size:12px;color:#8fa3bc;border-top:1px solid #eef3f9">${opts.footer ? `${opts.footer}<br>` : ""}Sent with Home Service Ops by Local Service Pro</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("\n");
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email isn't set up yet. Add RESEND_API_KEY to the Supabase Edge Function secrets.");
    this.name = "EmailNotConfiguredError";
  }
}

export async function sendAppEmail(opts: { to: string; subject: string; html: string; text: string; fromName: string; replyTo?: string }) {
  const fromName = opts.fromName.replace(/[<>"]/g, "").slice(0, 60) || "Home Service Ops";
  const message = {
    from: `${fromName} <hello@${SEND_DOMAIN}>`,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
  };
  const key = env("RESEND_API_KEY");
  if (!key) {
    if (env("EMAIL_DEV_LOG")) {
      console.log("[email]", JSON.stringify({ ...message, html: undefined }));
      return `dev-${Date.now()}`;
    }
    throw new EmailNotConfiguredError();
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Email couldn't be sent: ${body.message ?? res.statusText}`);
  return body.id;
}
