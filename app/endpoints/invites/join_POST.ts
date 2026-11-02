import superjson from "superjson";
import { sql } from "kysely";
import { db } from "../../helpers/db";
import { findOpenInvite } from "../../helpers/accountSetup";
import { AUTH_URL, env } from "../../helpers/serverEnv";
import { schema, OutputType } from "./join_POST.schema";

type AuthRow = { id: string; confirmed: boolean; hasPassword: boolean; providers: string | null; businessId: number | null };

async function adminAuth(path: string, method: "POST" | "PUT", body: unknown) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${AUTH_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { msg?: string; message?: string; error_description?: string };
    throw new Error(j.msg || j.message || j.error_description || `Couldn't create your login (${res.status})`);
  }
}

export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const found = await findOpenInvite(input.token);
    if (!found.ok) throw new Error(found.reason);
    const email = found.invite.email.trim().toLowerCase();
    // Link-only invites (no email) keep the normal sign-up with an email check.
    if (!email) throw new Error("This invite isn't tied to an email address. Sign up with your email instead.");

    const { rows } = await sql<AuthRow>`
      select au.id::text as id,
             au.email_confirmed_at is not null as confirmed,
             coalesce(au.encrypted_password, '') <> '' as "hasPassword",
             (select string_agg(i.provider, ',') from auth.identities i where i.user_id = au.id) as providers,
             (select m.business_id from hso.users hu join hso.memberships m on m.user_id = hu.id where hu.auth_id = au.id limit 1) as "businessId"
      from auth.users au
      where lower(au.email) = ${email}
      limit 1`.execute(db);
    const existing = rows[0];
    const metadata = { display_name: input.displayName, invite_token: input.token };

    if (existing?.confirmed) {
      // Never change the password of a login someone already uses; they sign in to join instead.
      const providers = (existing.providers ?? "").split(",");
      const out: OutputType = {
        status: "existing",
        email,
        ownBusiness: existing.businessId != null && existing.businessId !== found.invite.businessId,
        member: existing.businessId === found.invite.businessId,
        google: providers.includes("google"),
        password: existing.hasPassword,
      };
      return new Response(superjson.stringify(out));
    }
    if (existing) {
      // An earlier sign-up that was never confirmed: finish it with these details.
      await adminAuth(`/admin/users/${existing.id}`, "PUT", { password: input.password, email_confirm: true, user_metadata: metadata });
    } else {
      await adminAuth("/admin/users", "POST", { email, password: input.password, email_confirm: true, user_metadata: metadata });
    }
    return new Response(superjson.stringify({ status: "created", email } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
