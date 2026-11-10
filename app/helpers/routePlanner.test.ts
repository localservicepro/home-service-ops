import { describe, it, expect } from "vitest";
import { bestOrder, estimate, formatTime, haversineKm, matrixTravel, parseTime, planRoutes, routeLinks, travel, type PlanOptions } from "./routePlanner";

// A yard in North Lakes (QLD) and jobs along a line heading south, a few km apart.
const DEPOT = { lat: -27.235, lng: 153.0 };
const at = (km: number) => ({ lat: -27.235 - km / 111, lng: 153.0 });
const opts = (o: Partial<PlanOptions> = {}): PlanOptions => ({ depot: DEPOT, startMin: 7 * 60 + 30, minutesPerJob: 60, returnToDepot: true, crewIds: [1], assignUnassigned: false, ...o });

describe("distances and times", () => {
  it("haversine is about right", () => {
    expect(haversineKm(DEPOT, at(10))).toBeCloseTo(10, 0);
  });

  it("travel grows with distance and short hops are slow", () => {
    const a = travel(DEPOT, at(2));
    const b = travel(DEPOT, at(20));
    expect(a.km).toBeCloseTo(2.6, 1);
    expect(a.min).toBeGreaterThan(5);
    expect(b.min).toBeGreaterThan(a.min);
    expect(b.km / (b.min / 60)).toBeGreaterThan(a.km / (a.min / 60)); // faster average on a longer trip
    expect(travel(DEPOT, DEPOT)).toEqual({ km: 0, min: 0 });
  });

  it("parses and formats the app's times", () => {
    expect(parseTime("9:00 AM")).toBe(540);
    expect(parseTime("12:30 PM")).toBe(750);
    expect(parseTime("12:15 AM")).toBe(15);
    expect(parseTime("")).toBeNull();
    expect(formatTime(543)).toBe("9:05 AM");
    expect(formatTime(780)).toBe("1:00 PM");
    expect(formatTime(0)).toBe("12:00 AM");
  });
});

describe("ordering", () => {
  it("visits stops along a line in order, out and back", () => {
    const pts = [5, 1, 9, 3, 7].map((k) => ({ id: k, at: at(k) }));
    expect(bestOrder(DEPOT, pts, true).map((p) => p.id)).toEqual([1, 3, 5, 7, 9]);
  });

  it("untangles a crossed route (2-opt)", () => {
    // Corners of a square around the depot, given in a crossing order.
    const sq = [
      { id: 1, at: { lat: DEPOT.lat + 0.05, lng: DEPOT.lng + 0.05 } },
      { id: 2, at: { lat: DEPOT.lat - 0.05, lng: DEPOT.lng - 0.05 } },
      { id: 3, at: { lat: DEPOT.lat + 0.05, lng: DEPOT.lng - 0.05 } },
      { id: 4, at: { lat: DEPOT.lat - 0.05, lng: DEPOT.lng + 0.05 } },
    ];
    const order = bestOrder(DEPOT, sq, true).map((p) => p.id);
    // Any tour around the square without crossing: neighbours in the order are adjacent corners.
    const adjacent = new Set(["1-3", "3-1", "3-2", "2-3", "2-4", "4-2", "4-1", "1-4"]);
    for (let i = 0; i < order.length - 1; i++) expect(adjacent.has(`${order[i]}-${order[i + 1]}`)).toBe(true);
  });
});

describe("planRoutes", () => {
  it("reorders a crew member's day, with arrival times and totals, and keeps the current order for comparison", () => {
    const jobs = [
      // Booked to zig-zag: 1 km out, then 9 km, then back to 5 km.
      { id: 10, at: at(9), staffId: 1, time: "9:30 AM" },
      { id: 11, at: at(1), staffId: 1, time: "8:00 AM" },
      { id: 12, at: at(5), staffId: 1, time: "11:00 AM" },
    ];
    // No drive home here: out and back along a line costs the same in any order.
    const p = planRoutes(jobs, opts({ returnToDepot: false }));
    const r = p.routes[0];
    expect(r.stops.map((s) => s.jobId)).toEqual([11, 12, 10]);
    expect(r.stops[0].arriveMin).toBeGreaterThan(7 * 60 + 30);
    expect(r.stops[1].arriveMin).toBe(r.stops[0].departMin + r.stops[1].driveMin);
    expect(r.stops[0].departMin - r.stops[0].arriveMin).toBe(60);
    expect(r.returnKm).toBe(0);
    expect(p.current[0].stops.map((s) => s.jobId)).toEqual([11, 10, 12]); // by booked time
    expect(r.km).toBeLessThan(p.current[0].km);
    expect(r.driveMin).toBeLessThan(p.current[0].driveMin);
  });

  it("reports jobs it couldn't place and leaves unassigned jobs alone unless asked", () => {
    const jobs = [
      { id: 1, at: at(2), staffId: 1, time: "" },
      { id: 2, at: null, staffId: 1, time: "" },
      { id: 3, at: at(4), staffId: null, time: "" },
    ];
    const p = planRoutes(jobs, opts());
    expect(p.unlocated).toEqual([2]);
    expect(p.unassigned).toEqual([3]);
    expect(p.routes[0].stops.map((s) => s.jobId)).toEqual([1]);
  });

  it("shares unassigned jobs out to the crew whose route they suit, balancing the day", () => {
    const north = (km: number) => ({ lat: -27.235 + km / 111, lng: 153.0 });
    const jobs = [
      { id: 1, at: at(10), staffId: 1, time: "" }, // crew 1 works south
      { id: 2, at: north(10), staffId: 2, time: "" }, // crew 2 works north
      { id: 3, at: at(12), staffId: null, time: "" },
      { id: 4, at: north(11), staffId: null, time: "" },
      { id: 5, at: at(8), staffId: null, time: "" },
    ];
    const p = planRoutes(jobs, opts({ crewIds: [1, 2], assignUnassigned: true }));
    const of = (sid: number) => p.routes.find((r) => r.staffId === sid)!.stops.map((s) => s.jobId).sort();
    expect(of(1)).toEqual([1, 3, 5]);
    expect(of(2)).toEqual([2, 4]);
    expect(p.unassigned).toEqual([]);
  });

  it("works without a depot: starts at a job, no drive home", () => {
    const jobs = [1, 4, 2].map((k) => ({ id: k, at: at(k), staffId: 1, time: "" }));
    const r = planRoutes(jobs, opts({ depot: null })).routes[0];
    expect(r.stops[0].driveMin).toBe(0);
    expect(r.returnKm).toBe(0);
    expect(r.stops.map((s) => s.jobId)).toEqual([4, 2, 1]);
  });
});

describe("routeLinks", () => {
  it("one link for a short day, starting from the yard and returning to it", () => {
    const links = routeLinks(["1 A St", "2 B St"], "Yard, North Lakes", "Yard, North Lakes");
    expect(links).toHaveLength(1);
    const u = new URL(links[0]);
    expect(u.searchParams.get("origin")).toBe("Yard, North Lakes");
    expect(u.searchParams.get("waypoints")).toBe("1 A St|2 B St");
    expect(u.searchParams.get("destination")).toBe("Yard, North Lakes");
    expect(u.searchParams.get("travelmode")).toBe("driving");
  });

  it("splits a long day into links that follow on (9 stops between ends)", () => {
    const stops = Array.from({ length: 15 }, (_, i) => `${i + 1} Main St`);
    const links = routeLinks(stops, "Yard");
    expect(links).toHaveLength(2);
    const a = new URL(links[0]);
    const b = new URL(links[1]);
    expect(a.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
    expect(a.searchParams.get("destination")).toBe("10 Main St");
    expect(b.searchParams.get("origin")).toBe("10 Main St");
    expect(b.searchParams.get("destination")).toBe("15 Main St");
  });
});

describe("matrixTravel", () => {
  const a = { lat: -27.2, lng: 153.0 };
  const b = { lat: -27.21, lng: 153.01 };
  const c = { lat: -27.5, lng: 153.3 };
  it("uses the road table and falls back to the estimate for gaps", () => {
    const tv = matrixTravel([a, b], [[0, 7], [null, 0]], [[0, 3.2], [null, 0]]);
    expect(tv(a, b)).toEqual({ km: 3.2, min: 7 });
    expect(tv(b, a)).toEqual(estimate(b, a));
    expect(tv(a, c)).toEqual(estimate(a, c));
  });
  it("orders stops by road time, not straight-line distance", () => {
    // B is closer as the crow flies, but a river makes it slow to reach first.
    const depot = { lat: -27.0, lng: 153.0 };
    const near = { lat: -27.01, lng: 153.0 };
    const far = { lat: -27.05, lng: 153.0 };
    const pts = [depot, near, far];
    const min = [
      [0, 40, 6],
      [40, 0, 5],
      [6, 5, 0],
    ];
    const km = min.map((r) => r.map((m) => m / 2));
    const plan = planRoutes(
      [
        { id: 1, at: near, staffId: 9, time: "" },
        { id: 2, at: far, staffId: 9, time: "" },
      ],
      { depot, startMin: 480, minutesPerJob: 60, returnToDepot: false, crewIds: [9], assignUnassigned: false, travel: matrixTravel(pts, min, km) },
    );
    expect(plan.routes[0].stops.map((s) => s.jobId)).toEqual([2, 1]);
    expect(plan.routes[0].driveMin).toBe(11);
  });
});
