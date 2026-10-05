import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Cancel an unused invite, or remove a member's access (membershipId).
export const schema = z
  .object({ inviteId: z.number().int().optional(), membershipId: z.number().int().optional() })
  .refine((v) => !!v.inviteId !== !!v.membershipId, { message: "Pass an invite or a member" });
export type InputType = z.infer<typeof schema>;
export type OutputType = { ok: true };

export const postTeamRevoke = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/team/revoke`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
