import superjson from "superjson";
import { db } from "../../helpers/db";
import { esc, layout, sendAppEmail, EmailNotConfiguredError } from "../../helpers/mailer";
import { APP_URL, AUTH_URL, env } from "../../helpers/serverEnv";
import { schema, OutputType } from "./forgot_POST.schema";

// Emails a single-use password reset link (/reset/<token_hash>, 1 hour) made with Supabase Auth.
// Always answers "ok" so it can't be used to probe which emails have accounts. Without Resend
// configured it answers fallback: true and the browser asks Supabase to send its own email.
export async function handle(request: Request) {
  try {
    const input = schema.parse(superjson.parse(await request.text()));
    const email = input.email.trim().toLowerCase();
    if (!env("RESEND_API_KEY") && !env("EMAIL_DEV_LOG")) return new Response(superjson.stringify({ ok: true, fallback: true } satisfies OutputType));

    const recent = await db
      .selectFrom("authEmailLog")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("email", "=", email)
      .where("createdAt", ">", new Date(Date.now() - 60 * 60 * 1000))
      .executeTakeFirstOrThrow();
    if (Number(recent.n) >= 5) return new Response(superjson.stringify({ ok: true } satisfies OutputType));
    await db.insertInto("authEmailLog").values({ email }).execute();

    const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const res = await fetch(`${AUTH_URL}/admin/generate_link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", email, redirect_to: `${APP_URL}/reset/recovery` }),
    });
    if (res.ok) {
      const link = (await res.json()) as { hashed_token?: string; properties?: { hashed_token?: string }; user_metadata?: { display_name?: string } };
      const token = link.hashed_token ?? link.properties?.hashed_token;
      const profile = await db.selectFrom("users").select("displayName").where("email", "=", email).executeTakeFirst();
      const first = (profile?.displayName ?? link.user_metadata?.display_name ?? "").split(" ")[0] || "there";
      if (token) {
        const url = `${APP_URL}/reset/${token}`;
        await sendAppEmail({
          to: email,
          fromName: "Home Service Ops",
          subject: "Reset your password",
          html: layout({
            brand: "Home Service Ops",
            heading: "Reset your password",
            paragraphs: [`Hi ${esc(first)},`, "Tap the button below to choose a new password. The link works once and expires in 1 hour.", "If you didn't ask for this, you can ignore this email."],
            cta: { label: "Choose a new password", url },
          }),
          text: `Hi ${first},\n\nReset your Home Service Ops password (the link works once and expires in 1 hour):\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
        }).catch((e) => {
          if (!(e instanceof EmailNotConfiguredError)) console.error("Reset email failed", e instanceof Error ? e.message : e);
        });
      }
    }
    return new Response(superjson.stringify({ ok: true } satisfies OutputType));
  } catch (error) {
    return new Response(superjson.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400 });
  }
}
