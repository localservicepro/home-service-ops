import { db } from "./db";
import { env } from "./serverEnv";
import type { LatLng } from "./routePlanner";

// Server-only: places addresses on the Dispatch map. Each address is looked up once and kept in
// hso.geocode_cache (shared, addresses aren't private to a business). Uses Google's Geocoding API
// when GOOGLE_MAPS_API_KEY is set and the Geocoding API is enabled for it; otherwise OpenStreetMap's
// Nominatim, which allows one request a second, so lookups are spread out and done ahead of time by
// the 15-minute tick as well as when the map opens.

const NOT_FOUND_RETRY_MS = 7 * 86_400_000;
const NOMINATIM_GAP_MS = 1100;

/** The cache key: lower case, punctuation folded to spaces, a trailing "Australia" dropped. */
export function addressKey(address: string) {
  return address
    .toLowerCase()
    .replace(/[,\s]*australia\s*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Found = LatLng | null; // null = the address doesn't exist on the map
type Outcome = { at: Found; provider: string } | "error";

let googleOff = false; // the key isn't allowed to geocode: don't keep asking in this worker
let lastNominatim = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function google(address: string, key: string): Promise<Outcome | "unavailable"> {
  const q = new URLSearchParams({ address, region: "au", components: "country:AU", key });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${q}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res) return "error";
  const j = (await res.json().catch(() => ({}))) as { status?: string; results?: { geometry?: { location?: { lat: number; lng: number } } }[] };
  if (j.status === "OK" && j.results?.[0]?.geometry?.location) {
    const { lat, lng } = j.results[0].geometry.location;
    return { at: { lat, lng }, provider: "google" };
  }
  if (j.status === "ZERO_RESULTS") return { at: null, provider: "google" };
  if (j.status === "REQUEST_DENIED") return "unavailable";
  return "error";
}

async function nominatim(address: string): Promise<Outcome> {
  const wait = lastNominatim + NOMINATIM_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const q = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", countrycodes: "au" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
    headers: { "User-Agent": "HomeServiceOps/1.0 (dispatch map; support@localservicepro.com.au)", "Accept-Language": "en-AU" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res || !res.ok) return "error";
  const j = (await res.json().catch(() => null)) as { lat?: string; lon?: string }[] | null;
  if (!Array.isArray(j)) return "error";
  if (!j.length || !j[0].lat || !j[0].lon) return { at: null, provider: "nominatim" };
  return { at: { lat: Number(j[0].lat), lng: Number(j[0].lon) }, provider: "nominatim" };
}

async function lookup(address: string): Promise<Outcome> {
  const key = env("GOOGLE_MAPS_API_KEY")?.trim();
  if (key && !googleOff) {
    const g = await google(address, key);
    if (g !== "unavailable") return g;
    googleOff = true;
  }
  return nominatim(address);
}

/** True when lookups go one a second (no Google geocoding), so callers locate fewer per request. */
export const isSlowGeocoder = () => googleOff || !env("GOOGLE_MAPS_API_KEY")?.trim();

/**
 * Places addresses on the map: cached ones at once, new ones looked up until the time budget runs
 * out. Returns each address's position (null = not found) and how many are still to look up.
 */
export async function locate(addresses: string[], budgetMs = 6000): Promise<{ at: Map<string, Found>; pending: number }> {
  const started = Date.now();
  const byKey = new Map<string, string>();
  for (const a of addresses) {
    const k = addressKey(a || "");
    if (k.length >= 4 && !byKey.has(k)) byKey.set(k, a.trim());
  }
  const out = new Map<string, Found>();
  if (!byKey.size) return { at: out, pending: 0 };

  const rows = await db.selectFrom("geocodeCache").select(["key", "lat", "lng", "status", "updatedAt"]).where("key", "in", [...byKey.keys()]).execute();
  const todo: string[] = [];
  const cached = new Map(rows.map((r) => [r.key, r]));
  for (const k of byKey.keys()) {
    const r = cached.get(k);
    if (r?.status === "ok" && r.lat != null && r.lng != null) out.set(k, { lat: r.lat, lng: r.lng });
    else if (r?.status === "not_found" && Date.now() - new Date(r.updatedAt).getTime() < NOT_FOUND_RETRY_MS) out.set(k, null);
    else todo.push(k);
  }

  let done = 0;
  for (const k of todo) {
    if (Date.now() - started > budgetMs) break;
    const address = byKey.get(k)!;
    const r = await lookup(address);
    done++;
    if (r === "error") continue;
    out.set(k, r.at);
    await db
      .insertInto("geocodeCache")
      .values({ key: k, address, lat: r.at?.lat ?? null, lng: r.at?.lng ?? null, status: r.at ? "ok" : "not_found", provider: r.provider })
      .onConflict((oc) => oc.column("key").doUpdateSet({ address, lat: r.at?.lat ?? null, lng: r.at?.lng ?? null, status: r.at ? "ok" : "not_found", provider: r.provider, updatedAt: new Date() }))
      .execute();
  }
  return { at: out, pending: todo.length - done };
}

/** Tick: look up the addresses of jobs from today to two weeks out, ahead of anyone opening the map. */
export async function locateUpcomingJobs(budgetMs = 40_000) {
  const today = new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const jobs = await db
    .selectFrom("jobs")
    .innerJoin("businesses", "businesses.id", "jobs.businessId")
    .select("jobs.address")
    .where("businesses.isDemo", "=", false)
    .where("jobs.status", "!=", "Cancelled")
    .where("jobs.address", "!=", "")
    .where("jobs.scheduledDate", ">=", new Date(`${today}T00:00:00Z`))
    .where("jobs.scheduledDate", "<=", new Date(`${until}T00:00:00Z`))
    .execute();
  const r = await locate(
    jobs.map((j) => j.address),
    budgetMs,
  );
  return r.pending;
}
