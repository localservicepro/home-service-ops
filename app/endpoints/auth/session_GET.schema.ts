import { z } from "zod";
import superjson from "superjson";
import type { User } from "../../helpers/User";
import { apiFetch } from "../../helpers/apiFetch";
import { supabase } from "../../helpers/supabaseClient";

// The signed-in user's app profile. Also finishes a Google sign-up: the choice made before
// leaving for Google (new business or invite) is kept in localStorage until the api links it.
export const schema = z.object({});
export type OutputType = { user: User } | { error: string };

export const PENDING_SIGNUP_KEY = "hso.pendingSignup";
export type PendingSignup = { mode: "signin" | "signup"; inviteToken?: string; businessName?: string };

function takePending(): PendingSignup | null {
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_SIGNUP_KEY);
    return JSON.parse(raw) as PendingSignup;
  } catch {
    return null;
  }
}

export const getSession = async (): Promise<OutputType> => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { error: "Not authenticated" };
  const pending = takePending();
  const qs = pending ? `?${new URLSearchParams({ mode: pending.mode, ...(pending.inviteToken ? { invite: pending.inviteToken } : {}), ...(pending.businessName ? { business: pending.businessName } : {}) })}` : "";
  const result = await apiFetch(`/auth/session${qs}`, { method: "GET" });
  return superjson.parse<OutputType>(await result.text());
};
