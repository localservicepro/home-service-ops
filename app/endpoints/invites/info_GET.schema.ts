import { z } from "zod";
import superjson from "superjson";
import type { MemberRole } from "../../helpers/schema";
import { apiFetch } from "../../helpers/apiFetch";

// Public: what an invite link is for, shown on the join page before sign-up.
export const schema = z.object({ token: z.string().min(10).max(100) });
export type InputType = z.infer<typeof schema>;
export type OutputType =
  | { ok: true; businessName: string; role: MemberRole; email: string; crewName: string | null }
  | { ok: false; reason: string };

export const getInviteInfo = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const validated = schema.parse(params);
  const result = await apiFetch(`/invites/info?token=${encodeURIComponent(validated.token)}`, {
    method: "GET",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
