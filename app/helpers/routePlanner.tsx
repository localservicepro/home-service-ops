// Shared by the browser and the api, no I/O: crew route planning for the Dispatch tab.
//
// Travel comes from real road times when the caller has them (a table from the routing service,
// see matrixTravel), otherwise it's estimated from straight-line distance (a road factor on top,
// and an average speed that rises with the length of the trip).

export type LatLng = { lat: number; lng: number };

export type PlanJob = {
  id: number;
  /** null when the address couldn't be found on the map. */
  at: LatLng | null;
  staffId: number | null;
  /** The booked time, e.g. "9:00 AM" ("" = no time yet). */
  time: string;
};

export type PlanOptions = {
  /** Where crews start (and return to): the yard or office. null starts at the first job. */
  depot: LatLng | null;
  /** Start of the day, minutes after midnight. */
  startMin: number;
  /** Time on site per job. */
  minutesPerJob: number;
  /** Count the drive back to the depot at the end of the day. */
  returnToDepot: boolean;
  /** The crew members to plan for. */
  crewIds: number[];
  /** Share the day's unassigned jobs among those crew members. */
  assignUnassigned: boolean;
  /** Road km and minutes between two points; the straight-line estimate when left out. */
  travel?: TravelFn;
};

export type TravelFn = (a: LatLng, b: LatLng) => { km: number; min: number };

export type Stop = { jobId: number; driveMin: number; km: number; arriveMin: number; departMin: number };

export type Route = {
  staffId: number;
  stops: Stop[];
  km: number;
  driveMin: number;
  /** When the last job is finished (before any drive home). */
  finishMin: number;
  /** The drive back to the depot, when counted. */
  returnKm: number;
  returnMin: number;
};

export type Plan = {
  /** The suggested routes, one per crew member planned for. */
  routes: Route[];
  /** The same crew members' jobs in their current order (by booked time), for comparison. */
  current: Route[];
  /** Jobs that couldn't be placed because their address wasn't found. */
  unlocated: number[];
  /** Unassigned jobs still unassigned (assignUnassigned off, or no crew selected). */
  unassigned: number[];
};

const ROAD_FACTOR = 1.3;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated road km and driving minutes between two points. */
export function estimate(a: LatLng, b: LatLng) {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  if (km < 0.05) return { km: 0, min: 0 };
  // Suburban streets at ~25 km/h for short hops, rising towards ~70 km/h on longer trips.
  const speed = 25 + 45 * (1 - Math.exp(-km / 15));
  return { km, min: 2 + (km / speed) * 60 };
}

export const travel: TravelFn = (a, b) => estimate(a, b);

/** "9:00 AM" → minutes after midnight; anything else → null. */
export function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((t || "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const ap = (m[3] || "").toUpperCase();
  if (ap) h = (h % 12) + (ap === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** Minutes after midnight → "9:05 AM", rounded to the nearest 5 minutes. */
export function formatTime(min: number) {
  const r = Math.round(min / 5) * 5;
  const h24 = Math.floor(r / 60) % 24;
  const mm = r % 60;
  return `${h24 % 12 || 12}:${String(mm).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

const ptKey = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/**
 * Travel from a road table: min[i][j] and km[i][j] between points[i] and points[j]. Pairs the
 * table doesn't have (an unreachable spot, or a point not in it) fall back to the estimate.
 */
export function matrixTravel(points: LatLng[], min: (number | null)[][], km: (number | null)[][]): TravelFn {
  const index = new Map<string, number>();
  points.forEach((p, i) => {
    if (!index.has(ptKey(p))) index.set(ptKey(p), i);
  });
  return (a, b) => {
    const i = index.get(ptKey(a));
    const j = index.get(ptKey(b));
    if (i === j && i !== undefined) return { km: 0, min: 0 };
    const m = i !== undefined && j !== undefined ? min[i]?.[j] : null;
    const k = i !== undefined && j !== undefined ? km[i]?.[j] : null;
    return m != null && k != null ? { km: k, min: m } : travel(a, b);
  };
}

type Pt = { id: number; at: LatLng };

function pathCost(depot: LatLng | null, order: Pt[], back: boolean, tv: TravelFn = travel) {
  let cost = 0;
  let prev = depot;
  for (const p of order) {
    if (prev) cost += tv(prev, p.at).min;
    prev = p.at;
  }
  if (back && depot && prev && order.length) cost += tv(prev, depot).min;
  return cost;
}

function nearestNeighbour(depot: LatLng | null, pts: Pt[], tv: TravelFn) {
  if (!pts.length) return [];
  const left = [...pts];
  const out: Pt[] = [];
  let here: LatLng | null = depot;
  if (!here) {
    // No depot: start from the stop furthest out, so the day sweeps across rather than doubling back.
    const cx = left.reduce((s, p) => s + p.at.lat, 0) / left.length;
    const cy = left.reduce((s, p) => s + p.at.lng, 0) / left.length;
    left.sort((a, b) => haversineKm({ lat: cx, lng: cy }, b.at) - haversineKm({ lat: cx, lng: cy }, a.at));
    const first = left.shift()!;
    out.push(first);
    here = first.at;
  }
  while (left.length) {
    let best = 0;
    let bestCost = Infinity;
    for (let i = 0; i < left.length; i++) {
      const c = tv(here, left[i].at).min;
      if (c < bestCost) {
        bestCost = c;
        best = i;
      }
    }
    const next = left.splice(best, 1)[0];
    out.push(next);
    here = next.at;
  }
  return out;
}

/** 2-opt: reverse segments while that shortens the day. The start (depot) stays fixed. */
function twoOpt(depot: LatLng | null, order: Pt[], back: boolean, tv: TravelFn) {
  let best = [...order];
  let bestCost = pathCost(depot, best, back, tv);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const c = pathCost(depot, cand, back, tv);
        if (c < bestCost - 1e-9) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** The shortest order we can find for these stops. */
export function bestOrder(depot: LatLng | null, pts: Pt[], back: boolean, tv: TravelFn = travel) {
  return twoOpt(depot, nearestNeighbour(depot, pts, tv), back, tv);
}

function timeline(staffId: number, depot: LatLng | null, order: Pt[], opts: PlanOptions): Route {
  const travel = opts.travel ?? estimate;
  let t = opts.startMin;
  let prev = depot;
  let km = 0;
  let driveMin = 0;
  const stops: Stop[] = order.map((p) => {
    const leg = prev ? travel(prev, p.at) : { km: 0, min: 0 };
    km += leg.km;
    driveMin += leg.min;
    const arriveMin = t + leg.min;
    const departMin = arriveMin + opts.minutesPerJob;
    t = departMin;
    prev = p.at;
    return { jobId: p.id, driveMin: Math.round(leg.min), km: Math.round(leg.km * 10) / 10, arriveMin: Math.round(arriveMin), departMin: Math.round(departMin) };
  });
  const back = opts.returnToDepot && depot && prev && order.length ? travel(prev, depot) : { km: 0, min: 0 };
  return {
    staffId,
    stops,
    km: Math.round((km + back.km) * 10) / 10,
    driveMin: Math.round(driveMin + back.min),
    finishMin: Math.round(t),
    returnKm: Math.round(back.km * 10) / 10,
    returnMin: Math.round(back.min),
  };
}

/**
 * Plans the day: each selected crew member's located jobs in the shortest order, optionally with the
 * day's unassigned jobs shared out (each goes where it adds the least driving, nudged towards the
 * crew member with the lighter day), and arrival times from the start of the day.
 */
export function planRoutes(jobs: PlanJob[], opts: PlanOptions): Plan {
  const located = jobs.filter((j): j is PlanJob & { at: LatLng } => !!j.at);
  const unlocated = jobs.filter((j) => !j.at).map((j) => j.id);
  const crew = [...new Set(opts.crewIds)];
  const back = opts.returnToDepot;
  const tv = opts.travel ?? travel;

  // Current order: by booked time, then as given.
  const byTime = (a: PlanJob, b: PlanJob) => (parseTime(a.time) ?? 24 * 60) - (parseTime(b.time) ?? 24 * 60);
  const current = crew.map((sid) =>
    timeline(sid, opts.depot, located.filter((j) => j.staffId === sid).sort(byTime).map((j) => ({ id: j.id, at: j.at })), opts),
  );

  const routes = new Map<number, Pt[]>(crew.map((sid) => [sid, bestOrder(opts.depot, located.filter((j) => j.staffId === sid).map((j) => ({ id: j.id, at: j.at })), back, tv)]));
  const pool = located.filter((j) => j.staffId === null);
  let unassigned = pool.map((j) => j.id);

  if (opts.assignUnassigned && crew.length && pool.length) {
    const ref = opts.depot ?? pool[0].at;
    // Furthest first: the awkward ones get placed while there's still a choice.
    const queue = [...pool].sort((a, b) => haversineKm(ref, b.at) - haversineKm(ref, a.at));
    for (const j of queue) {
      let best: { sid: number; pos: number; score: number } | null = null;
      for (const sid of crew) {
        const r = routes.get(sid)!;
        const dayMin = pathCost(opts.depot, r, back, tv) + r.length * opts.minutesPerJob;
        for (let pos = 0; pos <= r.length; pos++) {
          const cand = [...r.slice(0, pos), { id: j.id, at: j.at }, ...r.slice(pos)];
          const added = pathCost(opts.depot, cand, back, tv) - pathCost(opts.depot, r, back, tv);
          const score = added + 0.15 * dayMin;
          if (!best || score < best.score) best = { sid, pos, score };
        }
      }
      const r = routes.get(best!.sid)!;
      routes.set(best!.sid, [...r.slice(0, best!.pos), { id: j.id, at: j.at }, ...r.slice(best!.pos)]);
    }
    for (const sid of crew) routes.set(sid, bestOrder(opts.depot, routes.get(sid)!, back, tv));
    unassigned = [];
  }

  return {
    routes: crew.map((sid) => timeline(sid, opts.depot, routes.get(sid)!, opts)),
    current,
    unlocated,
    unassigned,
  };
}

/**
 * Google Maps driving directions through the stops, in order. Google takes up to 9 stops between
 * the start and the end of a link, so a long day is split into several links that follow on.
 */
export function routeLinks(stops: string[], origin?: string, returnTo?: string) {
  const all = [...stops];
  if (returnTo) all.push(returnTo);
  if (!all.length) return [];
  const links: string[] = [];
  let from = origin || undefined;
  let i = 0;
  while (i < all.length) {
    const chunk = all.slice(i, i + 10);
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk.slice(0, -1);
    const q = new URLSearchParams({ api: "1", travelmode: "driving", destination });
    if (from) q.set("origin", from);
    if (waypoints.length) q.set("waypoints", waypoints.join("|"));
    links.push(`https://www.google.com/maps/dir/?${q.toString()}`);
    from = destination;
    i += chunk.length;
  }
  return links;
}
