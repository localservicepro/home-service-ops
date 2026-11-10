import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Create a login from an emailed invite. The invite link was sent to that address, so the
// account is created already confirmed and the browser signs straight in.
export const schema = z.object({
  token: z.string().min(10).max(100),
  displayName: z.string().trim().min(1, "Name is required").max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});
export type InputType = z.infer<typeof schema>;
export type OutputType =
  | { status: "created"; email: string }
  /** The email already has a confirmed login: in another business (`ownBusiness`), already in this one (`member`), or in none. */
  | { status: "existing"; email: string; ownBusiness: boolean; member: boolean; google: boolean; password: boolean };

export const postInviteJoin = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/invites/join`, {
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
