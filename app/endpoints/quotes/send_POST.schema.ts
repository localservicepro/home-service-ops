import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z
  .object({
    quoteId: z.number().int(),
    /** email, text message, or both */
    channel: z.enum(["email", "sms", "both"]).default("email"),
    to: z.union([z.literal(""), z.string().trim().email("Enter the customer's email")]).default(""),
    phone: z.string().trim().max(30).default(""),
    message: z.string().trim().max(1000).optional(),
    origin: z.string().url(),
  })
  .refine((v) => v.channel === "sms" || !!v.to, { message: "Enter the customer's email", path: ["to"] })
  .refine((v) => v.channel === "email" || !!v.phone, { message: "Enter the customer's mobile number", path: ["phone"] });
export type InputType = z.input<typeof schema>;
export type OutputType = {
  ok: true;
  /** Human summary of where it went, e.g. "jo@x.com and 0412 345 678". */
  sentTo: string;
  emailedTo: string | null;
  textedTo: string | null;
  /** Set when "both" was chosen and the text failed but the email went. */
  smsError: string | null;
};

export const postQuotesSend = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await apiFetch(`/quotes/send`, {
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
