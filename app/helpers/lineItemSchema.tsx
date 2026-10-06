import { z } from "zod";

// One invoice/quote line. Add-ons point at the service line they belong to via parentId.
export const lineItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["service", "addon", "custom"]),
  refId: z.number().int().nullable(),
  parentId: z.string().max(64).nullable(),
  name: z.string().trim().min(1).max(200),
  qty: z.number().int().min(1).max(999),
  price: z.number().min(0).max(1_000_000),
});
