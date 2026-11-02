import { describe, expect, it } from "vitest";
import { routeOf } from "./router";

describe("routeOf", () => {
  it("strips the hosted function prefix", () => {
    expect(routeOf("/functions/v1/api/clients/save")).toBe("clients/save");
  });
  it("handles the in-function path and trailing slashes", () => {
    expect(routeOf("/api/auth/session/")).toBe("auth/session");
    expect(routeOf("/embed")).toBe("embed");
  });
});
