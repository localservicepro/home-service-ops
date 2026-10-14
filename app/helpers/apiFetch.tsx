import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabaseClient";

// Browser-only. Calls the `api` Edge Function: /functions/v1/api/<route>, with the signed-in
// user's access token (or the anon key for public pages).
export const API_BASE = `${SUPABASE_URL}/functions/v1/api`;

// Run the function in the database's region (Sydney). Left to itself, Supabase picks the edge
// region nearest the visitor, and every query then crosses the region boundary: about 3 s a call.
const API_REGION = (import.meta.env.VITE_API_REGION as string | undefined) ?? "ap-southeast-2";

function apiUrl(path: string) {
  if (!API_REGION) return `${API_BASE}${path}`;
  return `${API_BASE}${path}${path.includes("?") ? "&" : "?"}forceFunctionRegion=${API_REGION}`;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("apikey", SUPABASE_ANON_KEY);
  return fetch(apiUrl(path), { ...init, headers, credentials: "omit" });
}
