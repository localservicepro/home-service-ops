// Shared by the browser and the api, no I/O: road routes from OSRM (OpenStreetMap) or Google's
// Routes API, turned into one shape the map and the turn-by-turn list can draw.

export type TurnIcon =
  | "depart"
  | "arrive"
  | "straight"
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "roundabout"
  | "merge"
  | "fork-left"
  | "fork-right"
  | "ramp";

export type RoadStep = {
  text: string;
  /** Distance and time driven after this instruction, until the next one. */
  km: number;
  min: number;
  /** Where the instruction happens: [lat, lng]. */
  at: [number, number];
  icon: TurnIcon;
};

export type RoadLeg = { km: number; min: number; steps: RoadStep[] };

export type RoadRoute = {
  km: number;
  min: number;
  /** Main roads it uses, e.g. "Pacific Motorway, Gold Coast Highway". */
  via: string;
  /** The line along the roads, as an encoded polyline. */
  polyline: string;
  precision: 5 | 6;
  /** Minutes include live traffic (Google). */
  traffic: boolean;
  /** Steps are empty unless asked for. */
  legs: RoadLeg[];
};

export type RoadProvider = "google" | "osrm";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Encoded polyline → [lat, lng] points. */
export function decodePolyline(str: string, precision: 5 | 6 = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    lat += next();
    lng += next();
    out.push([lat / factor, lng / factor]);
  }
  return out;
}

/** "350 m", "1.2 km", "14 km". */
export function fmtDistance(km: number) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

// ---------- OSRM ----------

type OsrmStep = {
  distance: number;
  duration: number;
  name?: string;
  ref?: string;
  destinations?: string;
  exits?: string;
  rotary_name?: string;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number]; bearing_after?: number };
};
type OsrmLeg = { distance: number; duration: number; summary?: string; steps?: OsrmStep[] };
type OsrmRoute = { distance: number; duration: number; geometry: string; legs: OsrmLeg[] };

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

function roadName(s: OsrmStep) {
  const name = (s.name || "").trim();
  const ref = (s.ref || "").split(";")[0].trim();
  if (name && ref && !name.includes(ref)) return `${name} (${ref})`;
  return name || ref;
}

function osrmIcon(s: OsrmStep): TurnIcon {
  const { type, modifier = "" } = s.maneuver;
  if (type === "depart") return "depart";
  if (type === "arrive") return "arrive";
  if (type === "roundabout" || type === "rotary" || type === "exit roundabout" || type === "exit rotary" || type === "roundabout turn") return "roundabout";
  if (type === "merge") return "merge";
  if (type === "on ramp" || type === "off ramp") return "ramp";
  if (type === "fork") return modifier.includes("left") ? "fork-left" : "fork-right";
  switch (modifier) {
    case "left":
    case "right":
    case "uturn":
    case "straight":
      return modifier;
    case "slight left":
      return "slight-left";
    case "slight right":
      return "slight-right";
    case "sharp left":
      return "sharp-left";
    case "sharp right":
      return "sharp-right";
    default:
      return "straight";
  }
}

/** A plain-English instruction for an OSRM step (OSRM gives the manoeuvre, not the words). */
export function osrmInstruction(s: OsrmStep): string {
  const { type, modifier = "", exit, bearing_after } = s.maneuver;
  const name = roadName(s);
  const onto = name ? ` onto ${name}` : "";
  const side = modifier.includes("left") ? "left" : modifier.includes("right") ? "right" : "";
  const turn = (m: string) => (m === "straight" ? "Go straight" : m === "uturn" ? "Make a U-turn" : m.startsWith("slight") ? `Bear ${side}` : m.startsWith("sharp") ? `Turn sharp ${side}` : `Turn ${m}`);
  switch (type) {
    case "depart": {
      const dir = bearing_after != null ? COMPASS[Math.round(bearing_after / 45) % 8] : "";
      if (!dir) return name ? `Start on ${name}` : "Start driving";
      return `Head ${dir}${name ? ` on ${name}` : ""}`;
    }
    case "arrive":
      return side ? `Arrive at the destination, on the ${side}` : "Arrive at the destination";
    case "roundabout":
    case "rotary":
      return exit ? `At the roundabout, take the ${ordinal(exit)} exit${onto}` : `Go through the roundabout${onto}`;
    case "roundabout turn":
      return `At the roundabout, ${turn(modifier || "straight").toLowerCase()}${onto}`;
    case "exit roundabout":
    case "exit rotary":
      return `Exit the roundabout${onto}`;
    case "merge":
      return `Merge${side ? ` ${side}` : ""}${onto}`;
    case "on ramp":
      return `Take the ramp${side ? ` on the ${side}` : ""}${onto}`;
    case "off ramp": {
      const to = s.destinations ? ` towards ${s.destinations.split(":").pop()!.trim()}` : "";
      const no = s.exits ? ` ${s.exits.split(";")[0]}` : "";
      return `Take exit${no}${side ? ` on the ${side}` : ""}${to || onto}`;
    }
    case "fork":
      return `Keep ${side || "straight"}${onto}`;
    case "end of road":
      return `At the end of the road, turn ${side || "straight"}${onto}`;
    case "new name":
    case "notification":
      return name ? `Continue onto ${name}` : "Continue";
    case "continue":
      return modifier && modifier !== "straight" ? `${turn(modifier)} to stay${name ? ` on ${name}` : " on the road"}` : `Continue${name ? ` on ${name}` : ""}`;
    default:
      return `${turn(modifier || "straight")}${onto}`;
  }
}

function osrmSteps(raw: OsrmStep[]): RoadStep[] {
  const out: RoadStep[] = [];
  for (const s of raw) {
    const type = s.maneuver.type;
    const prev = out[out.length - 1];
    // "Exit the roundabout" right after "take the 2nd exit" says the same thing twice: fold it in.
    // Zero-length name changes add nothing to read.
    if (prev && (type === "exit roundabout" || type === "exit rotary" || (type === "new name" && s.distance === 0))) {
      prev.km = round3(prev.km + s.distance / 1000);
      prev.min = round1(prev.min + s.duration / 60);
      continue;
    }
    out.push({
      text: osrmInstruction(s),
      km: round3(s.distance / 1000),
      min: round1(s.duration / 60),
      at: [s.maneuver.location[1], s.maneuver.location[0]],
      icon: osrmIcon(s),
    });
  }
  return out;
}

/** OSRM /route response → our routes. */
export function parseOsrm(json: unknown, withSteps: boolean): RoadRoute[] {
  const j = json as { code?: string; routes?: OsrmRoute[] };
  if (j?.code !== "Ok" || !Array.isArray(j.routes)) return [];
  return j.routes.map((r) => ({
    km: round1(r.distance / 1000),
    min: Math.max(1, Math.round(r.duration / 60)),
    via: [...new Set(r.legs.flatMap((l) => (l.summary || "").split(",").map((x) => x.trim())).filter(Boolean))].slice(0, 2).join(", "),
    polyline: r.geometry,
    precision: 6 as const,
    traffic: false,
    legs: r.legs.map((l) => ({
      km: round1(l.distance / 1000),
      min: Math.round(l.duration / 60),
      steps: withSteps ? osrmSteps(l.steps ?? []) : [],
    })),
  }));
}

// ---------- Google Routes API ----------

type GLatLng = { latLng?: { latitude: number; longitude: number } };
type GStep = { distanceMeters?: number; staticDuration?: string; startLocation?: GLatLng; navigationInstruction?: { maneuver?: string; instructions?: string } };
type GLeg = { distanceMeters?: number; duration?: string; endLocation?: GLatLng; steps?: GStep[] };
type GRoute = { distanceMeters?: number; duration?: string; description?: string; polyline?: { encodedPolyline?: string }; legs?: GLeg[] };

const secs = (d?: string) => Number((d || "0s").replace(/s$/, "")) || 0;

const G_ICONS: Record<string, TurnIcon> = {
  DEPART: "depart",
  TURN_LEFT: "left",
  TURN_RIGHT: "right",
  TURN_SLIGHT_LEFT: "slight-left",
  TURN_SLIGHT_RIGHT: "slight-right",
  TURN_SHARP_LEFT: "sharp-left",
  TURN_SHARP_RIGHT: "sharp-right",
  UTURN_LEFT: "uturn",
  UTURN_RIGHT: "uturn",
  STRAIGHT: "straight",
  NAME_CHANGE: "straight",
  MERGE: "merge",
  RAMP_LEFT: "ramp",
  RAMP_RIGHT: "ramp",
  FORK_LEFT: "fork-left",
  FORK_RIGHT: "fork-right",
  ROUNDABOUT_LEFT: "roundabout",
  ROUNDABOUT_RIGHT: "roundabout",
};

/** Google Routes API computeRoutes response → our routes. */
export function parseGoogle(json: unknown, withSteps: boolean, traffic: boolean): RoadRoute[] {
  const j = json as { routes?: GRoute[] };
  if (!Array.isArray(j?.routes)) return [];
  return j.routes
    .filter((r) => r.polyline?.encodedPolyline)
    .map((r) => ({
      km: round1((r.distanceMeters ?? 0) / 1000),
      min: Math.max(1, Math.round(secs(r.duration) / 60)),
      via: (r.description || "").replace(/^via\s+/i, ""),
      polyline: r.polyline!.encodedPolyline!,
      precision: 5 as const,
      traffic,
      legs: (r.legs ?? []).map((l) => {
        const steps: RoadStep[] = withSteps
          ? (l.steps ?? []).map((s) => ({
              text: s.navigationInstruction?.instructions?.replace(/\n/g, ". ") || "Continue",
              km: round3((s.distanceMeters ?? 0) / 1000),
              min: round1(secs(s.staticDuration) / 60),
              at: [s.startLocation?.latLng?.latitude ?? 0, s.startLocation?.latLng?.longitude ?? 0] as [number, number],
              icon: G_ICONS[s.navigationInstruction?.maneuver ?? ""] ?? "straight",
            }))
          : [];
        // Google has no arrival step; add one so each leg ends the same way as OSRM's.
        if (withSteps && l.endLocation?.latLng)
          steps.push({ text: "Arrive at the destination", km: 0, min: 0, at: [l.endLocation.latLng.latitude, l.endLocation.latLng.longitude], icon: "arrive" });
        return { km: round1((l.distanceMeters ?? 0) / 1000), min: Math.round(secs(l.duration) / 60), steps };
      }),
    }));
}
