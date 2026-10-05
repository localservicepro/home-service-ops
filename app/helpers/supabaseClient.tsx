import { createClient } from "@supabase/supabase-js";

// Browser-only. Supabase Auth for sign-in; all app data goes through the `api` Edge Function.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") || window.location.origin;
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "public-anon-key";

/** Where customer-facing links point (quotes, invoices, invites). */
export const APP_URL = ((import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin).replace(/\/+$/, "");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});
