import superjson from "superjson";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { cancelSubscriptionNow } from "../../helpers/billing";
import { isStripeConfigured } from "../../helpers/stripeConnect";
import { deleteFolder } from "../../helpers/storage";
import { AUTH_URL, env } from "../../helpers/serverEnv";
import { errorResponse } from "../../helpers/tenant";
import { schema, OutputType } from "./delete_POST.schema";

export async function handle(request: Request) {
  try {
    const { user, authUser } = await getServerUserSession(request);
    schema.parse(superjson.parse(await request.text()));

    // Businesses this person owns with no other owner are deleted with the account.
    const owned = await db
      .selectFrom("memberships as m")
      .select("m.businessId")
      .where("m.userId", "=", user.id)
      .where("m.role", "=", "owner")
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("memberships as o")
              .select("o.id")
              .whereRef("o.businessId", "=", "m.businessId")
              .where("o.role", "=", "owner")
              .where("o.userId", "!=", user.id),
          ),
        ),
      )
      .execute();

    for (const { businessId } of owned) {
      // Stop billing first; if Stripe can't be reached, nothing is deleted and they can retry.
      if (isStripeConfigured()) await cancelSubscriptionNow(businessId);
      for (const folder of ["job-photos", "lead-photos", "form-logos"]) {
        await deleteFolder(`${folder}/${businessId}`).catch(() => 0);
      }
      await db.deleteFrom("businesses").where("id", "=", businessId).execute();
    }

    // Removing the Supabase login cascades to hso.users and any remaining memberships.
    const key = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const res = await fetch(`${AUTH_URL}/admin/users/${authUser.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Couldn't delete your login (${res.status}). Please try again.`);
    await db.deleteFrom("users").where("id", "=", user.id).execute();

    return new Response(superjson.stringify({ ok: true, businessesDeleted: owned.length } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
