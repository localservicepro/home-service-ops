// Server bundle stand-in for browser-only helpers (apiFetch, supabaseClient) that shared
// *.schema.ts files import for their client fetchers. Never called on the server.
const fail = () => {
  throw new Error("Browser-only helper called on the server");
};
export const apiFetch = fail;
export const API_BASE = "";
export const supabase = new Proxy({}, { get: fail });
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
export const APP_URL = "";
