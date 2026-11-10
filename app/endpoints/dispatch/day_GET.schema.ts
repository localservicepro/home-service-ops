import { z } from "zod";
import superjson from "superjson";
import { apiFetch } from "../../helpers/apiFetch";
import type { JobStatus } from "../../helpers/schema";

// Office: one day on the Dispatch map. Jobs scheduled that day (not cancelled), plus requests not
// booked in yet, with their place on the map; the crew; and the yard the routes start from.
export const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type InputType = z.infer<typeof schema>;

export type DispatchJob = {
  id: number;
  num: string;
  customer: string;
  address: string;
  phone: string;
  service: string;
  status: JobStatus;
  scheduledDate: string | null;
  scheduledTime: string;
  price: number;
  staffId: number | null;
  notes: string;
  /** null = not on the map yet (still being looked up, or the address wasn't found). */
  lat: number | null;
  lng: number | null;
  /** The address was looked up and doesn't exist on the map. */
  notFound: boolean;
};

export type OutputType = {
  date: string;
  jobs: DispatchJob[];
  /** Requests (New / Quote sent) with no date yet. */
  requests: DispatchJob[];
  crew: { id: number; name: string; color: string; duty: string; phone: string }[];
  depot: { address: string; lat: number | null; lng: number | null; isBusinessAddress: boolean } | null;
  /** Addresses still to be looked up (ask again in a few seconds). */
  pending: number;
};

export const getDispatchDay = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const p = schema.parse(params);
  const result = await apiFetch(`/dispatch/day?date=${encodeURIComponent(p.date)}`, { method: "GET", ...init });
  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }
  return superjson.parse<OutputType>(await result.text());
};
