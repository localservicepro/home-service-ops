import { db } from "./db";
import { env } from "./serverEnv";
import type { LatLng } from "./routePlanner";
import { parseGoogle, parseOsrm, type RoadProvider, type RoadRoute } from "./roadRoute";

// Server-only: road routes for the Dispatch map and crew directions.
//
// OSRM (the OpenStreetMap routing engine) is the default: free, no key, with alternative routes,
// turn-by-turn steps and travel-time tables. It uses the public server at router.project-osrm.org
// unless OSRM_URL points at your own. The public server asks for light use, so requests are spaced
// out and every answer is cached in hso.road_cache.
//
// Google's Routes API is used for turn-by-turn directions when GOOGLE_MAPS_API_KEY is set and the
// Routes API is enabled for it: its times include live traffic. Without it (or if Google refuses
// the key) OSRM is used. Drive times from OSRM don't include traffic.

const OSRM_URL = () => (env("OSRM_URL") || "https://router.project-osrm.org").replace(/\/+$/, "");
const OSRM_GAP_MS = 1000;
const OSRM_TTL_MS = 7 * 86_400_000;
const GOOGLE_TTL_MS = 10 * 60_000;
const UA = "HomeServiceOps/1.0 (dispatch routing)";

let googleRoutesOff = false; // the key isn't allowed to use the Routes API: don't keep asking
let lastOsrm = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function cached<T>(raw: string, ttlMs: number, load: () => Promise<T | null>): Promise<T | null> {
  const key = await sha(raw);
  const hit = await db.selectFrom("roadCache").select(["data", "expiresAt"]).where("key", "=", key).executeTakeFirst().catch(() => undefined);
  if (hit && new Date(hit.expiresAt).getTime() > Date.now()) return hit.data as T;
  const fresh = await load();
  if (fresh != null) {
    const expiresAt = new Date(Date.now() + ttlMs);
    await db
      .insertInto("roadCache")
      .values({ key, data: JSON.stringify(fresh), expiresAt })
      .onConflict((oc) => oc.column("key").doUpdateSet({ data: JSON.stringify(fresh), expiresAt }))
      .execute()
      .catch(() => undefined);
  }
  return fresh;
}

async function osrmGet(path: string): Promise<unknown | null> {
  const wait = lastOsrm + OSRM_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastOsrm = Date.now();
  const res = await fetch(`${OSRM_URL()}${path}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

// Six decimals is ~10 cm: enough, and it keeps cache keys stable.
const c6 = (n: number) => Math.round(n * 1e6) / 1e6;
const coords = (pts: LatLng[]) => pts.map((p) => `${c6(p.lng)},${c6(p.lat)}`).join(";");

async function osrmRoutes(points: LatLng[], alternatives: boolean, steps: boolean) {
  const path = `/route/v1/driving/${coords(points)}?overview=full&geometries=polyline6&steps=${steps}&alternatives=${alternatives && points.length === 2 ? 3 : "false"}`;
  return cached<RoadRoute[]>(`osrm:${path}`, OSRM_TTL_MS, async () => {
    const j = await osrmGet(path);
    const routes = j ? parseOsrm(j, steps) : [];
    return routes.length ? routes : null;
  });
}

const FIELDS = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.description",
  "routes.polyline.encodedPolyline",
  "routes.legs.duration",
  "routes.legs.distanceMeters",
  "routes.legs.endLocation",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.startLocation",
  "routes.legs.steps.navigationInstruction",
].join(",");

async function googleRoutes(points: LatLng[], alternatives: boolean, key: string): Promise<RoadRoute[] | "unavailable" | null> {
  const wp = (p: LatLng) => ({ location: { latLng: { latitude: c6(p.lat), longitude: c6(p.lng) } } });
  const body = {
    origin: wp(points[0]),
    destination: wp(points[points.length - 1]),
    intermediates: points.slice(1, -1).map(wp),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    // Google only gives alternatives between two points.
    computeAlternativeRoutes: alternatives && points.length === 2,
    languageCode: "en-AU",
    regionCode: "au",
    units: "METRIC",
  };
  const raw = JSON.stringify(body);
  let refused = false;
  const out = await cached<RoadRoute[]>(`google:${raw}`, GOOGLE_TTL_MS, async () => {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: raw,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res) return null;
    if (res.status === 403 || res.status === 401) {
      // Not cached: only remembered for this worker.
      refused = true;
      return null;
    }
    if (!res.ok) return null;
    const routes = parseGoogle(await res.json().catch(() => null), true, true);
    return routes.length ? routes : null;
  });
  return refused ? "unavailable" : out;
}

export type RoadAnswer = { routes: RoadRoute[]; provider: RoadProvider } | null;

/**
 * Road routes through the points, in order. With `steps` (turn-by-turn), Google is tried first when
 * its key allows it; the map's route lines use OSRM. `alternatives` only applies between two points.
 * null = no routing service answered (the map falls back to straight lines).
 */
export async function roadRoutes(points: LatLng[], opts: { alternatives?: boolean; steps?: boolean } = {}): Promise<RoadAnswer> {
  if (points.length < 2) return null;
  const alternatives = !!opts.alternatives;
  const steps = !!opts.steps;
  const key = env("GOOGLE_MAPS_API_KEY")?.trim();
  const tryGoogle = async (): Promise<RoadAnswer> => {
    if (!key || googleRoutesOff || points.length > 27) return null;
    const g = await googleRoutes(points, alternatives, key);
    if (g === "unavailable") {
      googleRoutesOff = true;
      return null;
    }
    return g?.length ? { routes: g, provider: "google" } : null;
  };
  if (steps) {
    const g = await tryGoogle();
    if (g) return g;
  }
  const o = await osrmRoutes(points, alternatives, steps);
  if (o?.length) return { routes: o, provider: "osrm" };
  return steps ? null : tryGoogle();
}

/**
 * Driving minutes and km between every pair of points (OSRM's table service), for putting stops in
 * order by real road times. null = not available (the planner falls back to its estimate).
 */
export async function roadMatrix(points: LatLng[]): Promise<{ min: (number | null)[][]; km: (number | null)[][] } | null> {
  if (points.length < 2 || points.length > 100) return null;
  const path = `/table/v1/driving/${coords(points)}?annotations=duration,distance`;
  return cached(`osrm:${path}`, OSRM_TTL_MS, async () => {
    const j = (await osrmGet(path)) as { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] } | null;
    if (j?.code !== "Ok" || !j.durations || !j.distances) return null;
    return {
      min: j.durations.map((row) => row.map((s) => (s == null ? null : Math.round((s / 60) * 10) / 10))),
      km: j.distances.map((row) => row.map((m) => (m == null ? null : Math.round(m / 100) / 10))),
    };
  });
}

/** Tick: drop cached routes past their time. */
export async function pruneRoadCache() {
  await db.deleteFrom("roadCache").where("expiresAt", "<", new Date()).execute();
}
