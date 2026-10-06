import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabaseClient";

// Browser-only. Calls the `api` Edge Function: /functions/v1/api/<route>, with the signed-in
// user's access token (or the anon key for public pages).
export const API_BASE = `${SUPABASE_URL}/functions/v1/api`;

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("apikey", SUPABASE_ANON_KEY);
  return fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "omit" });
}
