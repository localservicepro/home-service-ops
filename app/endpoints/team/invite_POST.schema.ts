import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

// Create a join link. Crew invites must name the crew record the login belongs to.
export const schema = z
  .object({
    role: z.enum(["admin", "crew"]),
    email: z.string().trim().max(200).optional(),
    /** How to send the link: email, text (SMS Gateway) or both. Without SMS Gateway, texts fall back to email. */
    channel: z.enum(["email", "sms", "both"]).default("email"),
    phone: z.string().trim().max(40).optional(),
    staffId: z.number().int().optional(),
    origin: z.string().url().optional(),
  })
  .refine((v) => v.role !== "crew" || !!v.staffId, { message: "Pick which crew member this login is for", path: ["staffId"] });
export type InputType = z.infer<typeof schema>;
export type OutputType = { id: number; token: string; emailedTo: string | null; textedTo: string | null; smsError: string | null };

export const postTeamInvite = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/team/invite`, {
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
