import { z } from "zod";
import superjson from "superjson";
import type { MemberRole } from "../../helpers/schema";
import { apiFetch } from "../../helpers/apiFetch";

export const schema = z.object({});
export type InputType = z.infer<typeof schema>;
export type TeamMember = {
  membershipId: number;
  userId: number;
  name: string;
  email: string;
  role: MemberRole;
  staffId: number | null;
  isYou: boolean;
};
export type PendingInvite = {
  id: number;
  token: string;
  email: string;
  role: MemberRole;
  staffId: number | null;
  expiresAt: Date;
};
export type OutputType = { members: TeamMember[]; invites: PendingInvite[] };

export const getTeamList = async (init?: RequestInit): Promise<OutputType> => {
  const result = await apiFetch(`/team/list`, {
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
