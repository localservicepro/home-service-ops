import { describe, expect, it } from "vitest";
import { decodePolyline, fmtDistance, osrmInstruction, parseGoogle, parseOsrm } from "./roadRoute";

const step = (type: string, extra: Record<string, unknown> = {}, maneuver: Record<string, unknown> = {}) => ({
  distance: 120,
  duration: 30,
  name: "",
  ...extra,
  maneuver: { type, location: [153.01, -27.23] as [number, number], ...maneuver },
});

describe("decodePolyline", () => {
  it("decodes Google's example line", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(pts).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
  it("handles precision 6", () => {
    const [p] = decodePolyline("_izlhA~rlgdF", 6);
    expect(p[0]).toBeCloseTo(38.5, 5);
    expect(p[1]).toBeCloseTo(-120.2, 5);
  });
});

describe("osrmInstruction", () => {
  it("words the common manoeuvres", () => {
    expect(osrmInstruction(step("depart", { name: "Maddock Street" }, { bearing_after: 274 }))).toBe("Head west on Maddock Street");
    expect(osrmInstruction(step("turn", { name: "Anzac Avenue" }, { modifier: "left" }))).toBe("Turn left onto Anzac Avenue");
    expect(osrmInstruction(step("turn", { name: "Anzac Avenue" }, { modifier: "slight right" }))).toBe("Bear right onto Anzac Avenue");
    expect(osrmInstruction(step("roundabout", { name: "Gympie Road" }, { exit: 2 }))).toBe("At the roundabout, take the 2nd exit onto Gympie Road");
    expect(osrmInstruction(step("new name", { name: "Pacific Motorway", ref: "M1" }))).toBe("Continue onto Pacific Motorway (M1)");
    expect(osrmInstruction(step("off ramp", { destinations: "Robina, Varsity Lakes", exits: "82" }, { modifier: "slight left" }))).toBe("Take exit 82 on the left towards Robina, Varsity Lakes");
    expect(osrmInstruction(step("arrive", {}, { modifier: "right" }))).toBe("Arrive at the destination, on the right");
    expect(osrmInstruction(step("turn", {}, { modifier: "uturn" }))).toBe("Make a U-turn");
  });
});

describe("parseOsrm", () => {
  const json = {
    code: "Ok",
    routes: [
      {
        distance: 12_345,
        duration: 1_260,
        geometry: "abc",
        legs: [
          {
            distance: 12_345,
            duration: 1_260,
            summary: "Pacific Motorway, Reedy Creek Road",
            steps: [
              step("depart", { name: "A St", distance: 300 }, { bearing_after: 0 }),
              step("new name", { name: "B St", distance: 0 }),
              step("turn", { name: "C St", distance: 12_045, duration: 1_200 }, { modifier: "right" }),
              step("arrive", { distance: 0, duration: 0 }),
            ],
          },
        ],
      },
      { distance: 14_000, duration: 1_300, geometry: "def", legs: [{ distance: 14_000, duration: 1_300, summary: "Gold Coast Highway", steps: [] }] },
    ],
  };
  it("keeps routes in order with km, minutes and the main roads", () => {
    const r = parseOsrm(json, true);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ km: 12.3, min: 21, via: "Pacific Motorway, Reedy Creek Road", polyline: "abc", precision: 6, traffic: false });
    expect(r[1].via).toBe("Gold Coast Highway");
  });
  it("drops zero-length name changes and places steps as lat, lng", () => {
    const steps = parseOsrm(json, true)[0].legs[0].steps;
    expect(steps.map((s) => s.icon)).toEqual(["depart", "right", "arrive"]);
    expect(steps[0].at).toEqual([-27.23, 153.01]);
    expect(steps[1].km).toBeCloseTo(12.045);
  });
  it("reads a roundabout once, with the distance after it", () => {
    const steps = parseOsrm(
      {
        code: "Ok",
        routes: [
          {
            distance: 2000,
            duration: 200,
            geometry: "",
            legs: [
              {
                distance: 2000,
                duration: 200,
                summary: "Endeavour Boulevard",
                steps: [
                  step("depart", { name: "Maddock Street", distance: 118.8 }, { bearing_after: 274 }),
                  step("end of road", { distance: 106.4 }, { modifier: "left" }),
                  step("roundabout", { name: "Endeavour Boulevard", distance: 33.4, duration: 3 }, { exit: 2, modifier: "slight left" }),
                  step("exit roundabout", { name: "Endeavour Boulevard", distance: 355.2, duration: 27 }, { exit: 2, modifier: "straight" }),
                  step("turn", { name: "Burke Crescent", distance: 38 }, { modifier: "right" }),
                  step("arrive", { distance: 0, duration: 0 }, { modifier: "left" }),
                ],
              },
            ],
          },
        ],
      },
      true,
    )[0].legs[0].steps;
    expect(steps.map((s) => s.text)).toEqual([
      "Head west on Maddock Street",
      "At the end of the road, turn left",
      "At the roundabout, take the 2nd exit onto Endeavour Boulevard",
      "Turn right onto Burke Crescent",
      "Arrive at the destination, on the left",
    ]);
    expect(steps[2].km).toBeCloseTo(0.389, 2);
  });
  it("leaves steps out unless asked", () => {
    expect(parseOsrm(json, false)[0].legs[0].steps).toEqual([]);
  });
  it("returns nothing for an error answer", () => {
    expect(parseOsrm({ code: "NoRoute" }, true)).toEqual([]);
  });
});

describe("parseGoogle", () => {
  it("reads routes, traffic times and steps, ending each leg with an arrival", () => {
    const r = parseGoogle(
      {
        routes: [
          {
            distanceMeters: 8_000,
            duration: "900s",
            description: "via M1",
            polyline: { encodedPolyline: "xyz" },
            legs: [
              {
                distanceMeters: 8_000,
                duration: "900s",
                endLocation: { latLng: { latitude: -27.1, longitude: 153.1 } },
                steps: [{ distanceMeters: 500, staticDuration: "60s", startLocation: { latLng: { latitude: -27.2, longitude: 153.0 } }, navigationInstruction: { maneuver: "TURN_LEFT", instructions: "Turn left onto Smith St" } }],
              },
            ],
          },
        ],
      },
      true,
      true,
    );
    expect(r[0]).toMatchObject({ km: 8, min: 15, via: "M1", precision: 5, traffic: true });
    expect(r[0].legs[0].steps.map((s) => [s.icon, s.text])).toEqual([
      ["left", "Turn left onto Smith St"],
      ["arrive", "Arrive at the destination"],
    ]);
  });
});

describe("fmtDistance", () => {
  it("uses metres under a kilometre", () => {
    expect(fmtDistance(0.347)).toBe("350 m");
    expect(fmtDistance(1.24)).toBe("1.2 km");
    expect(fmtDistance(14.4)).toBe("14 km");
  });
});
