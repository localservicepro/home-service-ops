// Server-only. Runtime config for the `api` Supabase Edge Function.
// Supabase injects SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL;
// everything else is set with `supabase secrets set` (see README).

export const env = (name: string): string | undefined => {
  const v = (process.env as Record<string, string | undefined>)[name]?.trim();
  return v ? v : undefined;
};

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** The web app (customer links, redirects after OAuth). Never taken from the request. */
export const APP_URL = trimSlash(env("APP_URL") ?? "https://home.localservicepro.com.au");

export const SUPABASE_URL = trimSlash(env("SUPABASE_URL") ?? "http://localhost:54321");

/** Public base URL of this API: OAuth callbacks, webhooks, the embed script. */
export const API_URL = trimSlash(env("API_URL") ?? `${SUPABASE_URL}/functions/v1/api`);

export const AUTH_URL = trimSlash(env("AUTH_URL") ?? `${SUPABASE_URL}/auth/v1`);
export const STORAGE_URL = trimSlash(env("STORAGE_URL") ?? `${SUPABASE_URL}/storage/v1`);
