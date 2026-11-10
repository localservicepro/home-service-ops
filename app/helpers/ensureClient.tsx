import type { Kysely, Transaction } from "kysely";
import type { DB } from "./schema";

// Backend-only. Resolves the client a job/quote belongs to (within one business): uses
// clientId when given, otherwise matches by name (case-insensitive) or creates the client.
// Also records a new property address on the client so it shows up in their property list.
export async function ensureClient(
  trx: Kysely<DB> | Transaction<DB>,
  businessId: number,
  input: { clientId?: number | null; name: string; address?: string; phone?: string; email?: string; overwriteContact?: boolean },
): Promise<number> {
  const name = input.name.trim();
  const address = (input.address || "").trim();
  let client = input.clientId
    ? await trx.selectFrom("clients").selectAll().where("id", "=", input.clientId).where("businessId", "=", businessId).executeTakeFirst()
    : await trx
        .selectFrom("clients")
        .selectAll()
        .where("businessId", "=", businessId)
        .where((eb) => eb.fn("lower", ["name"]), "=", name.toLowerCase())
        .executeTakeFirst();

  if (!client) {
    const created = await trx
      .insertInto("clients")
      .values({ businessId, name, phone: (input.phone || "").trim(), email: (input.email || "").trim().toLowerCase(), addresses: address ? [address] : [] })
      .returning("id")
      .executeTakeFirstOrThrow();
    return created.id;
  }

  const addrs = Array.isArray(client.addresses) ? (client.addresses as string[]) : [];
  const patch: { addresses?: string[]; phone?: string; email?: string } = {};
  if (address && !addrs.some((a) => a.toLowerCase() === address.toLowerCase())) {
    patch.addresses = [...addrs, address];
  }
  // Fill in missing contact details; the quote and job forms can also correct them.
  const phone = input.phone?.trim();
  const email = input.email?.trim().toLowerCase();
  if (phone && phone !== client.phone && (!client.phone || input.overwriteContact)) patch.phone = phone;
  if (email && email !== client.email && (!client.email || input.overwriteContact)) patch.email = email;
  if (Object.keys(patch).length) {
    await trx.updateTable("clients").set(patch).where("id", "=", client.id).execute();
  }
  return client.id;
}
