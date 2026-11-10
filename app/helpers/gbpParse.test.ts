import { describe, expect, it } from "vitest";
import { cleanComment, foldName, friendlyGoogleError, matchClient, parseInsights, parseLocations, parseReviews, replyTemplates } from "./gbpParse";

describe("parseLocations", () => {
  it("reads title, address, place id, links and whether the login manages it", () => {
    const [l] = parseLocations(
      { name: "accounts/111", accountName: "Greenway Lawn Care" },
      {
        locations: [
          {
            name: "locations/999",
            title: "Greenway Lawn Care",
            storefrontAddress: { addressLines: ["4 Endeavour Blvd"], locality: "North Lakes", administrativeArea: "QLD", postalCode: "4509" },
            websiteUri: "https://greenway.com.au",
            phoneNumbers: { primaryPhone: "07 3000 0000" },
            metadata: { placeId: "ChIJabc", mapsUri: "https://maps.google.com/?cid=1", newReviewUri: "https://g.page/r/abc/review", hasVoiceOfMerchant: true },
          },
        ],
      },
    );
    expect(l).toEqual({
      name: "locations/999",
      account: "accounts/111",
      accountLabel: "Greenway Lawn Care",
      title: "Greenway Lawn Care",
      address: "4 Endeavour Blvd, North Lakes QLD 4509",
      placeId: "ChIJabc",
      mapsUrl: "https://maps.google.com/?cid=1",
      reviewUrl: "https://g.page/r/abc/review",
      phone: "07 3000 0000",
      website: "https://greenway.com.au",
      verified: true,
    });
  });
  it("copes with a service-area business (no address) and nothing at all", () => {
    expect(parseLocations({ name: "accounts/1" }, { locations: [{ name: "locations/2", title: "Mobile Mowing" }] })[0]).toMatchObject({ address: "", placeId: null, verified: false });
    expect(parseLocations({ name: "accounts/1" }, {})).toEqual([]);
  });
});

describe("parseReviews", () => {
  const json = {
    reviews: [
      {
        reviewId: "r1",
        reviewer: { displayName: "Sarah Mitchell", profilePhotoUrl: "https://x/p.jpg" },
        starRating: "FIVE",
        comment: "Great job on the lawn!",
        createTime: "2026-11-01T01:00:00Z",
        updateTime: "2026-11-01T01:00:00Z",
        reviewReply: { comment: "Thanks Sarah!", updateTime: "2026-11-02T01:00:00Z" },
      },
      { name: "accounts/1/locations/2/reviews/r2", reviewer: { isAnonymous: true }, starRating: "TWO", createTime: "2026-10-01T00:00:00Z" },
    ],
    averageRating: 4.6,
    totalReviewCount: 38,
    nextPageToken: "abc",
  };
  it("turns Google's review into ours", () => {
    const r = parseReviews(json);
    expect(r.average).toBe(4.6);
    expect(r.total).toBe(38);
    expect(r.next).toBe("abc");
    expect(r.reviews[0]).toMatchObject({ reviewId: "r1", stars: 5, reviewerName: "Sarah Mitchell", reply: "Thanks Sarah!" });
    expect(r.reviews[0].repliedAt?.toISOString()).toBe("2026-11-02T01:00:00.000Z");
  });
  it("handles star-only, anonymous reviews and takes the id from the name", () => {
    expect(parseReviews(json).reviews[1]).toMatchObject({ reviewId: "r2", stars: 2, comment: "", reviewerName: "A Google user", reply: null });
  });
  it("keeps the original words, not Google's translation", () => {
    expect(cleanComment("Muy buen trabajo\n\n(Translated by Google) Very good work")).toBe("Muy buen trabajo");
    expect(cleanComment("(Translated by Google) Very good work\n\n(Original)\nMuy buen trabajo")).toBe("Muy buen trabajo");
  });
});

describe("parseInsights", () => {
  const v = (y: number, m: number, d: number, value?: string) => ({ date: { year: y, month: m, day: d }, ...(value ? { value } : {}) });
  it("adds up this period and the one before, and keeps daily views", () => {
    const ins = parseInsights(
      {
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: [
              { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [v(2026, 11, 1, "10"), v(2026, 11, 2), v(2026, 10, 20, "4")] } },
              { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", timeSeries: { datedValues: [v(2026, 11, 1, "5")] } },
              { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [v(2026, 11, 2, "3"), v(2026, 10, 25, "1")] } },
              { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [v(2026, 11, 3, "2")] } },
              { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [v(2026, 11, 3, "6")] } },
            ],
          },
        ],
      },
      "2026-11-01",
      "2026-11-03",
      "2026-10-02",
    );
    expect(ins.totals).toEqual({ views: 15, calls: 3, website: 2, directions: 6 });
    expect(ins.previous).toEqual({ views: 4, calls: 1, website: 0, directions: 0 });
    expect(ins.daily).toEqual([
      ["2026-11-01", 15],
      ["2026-11-02", 0],
      ["2026-11-03", 0],
    ]);
  });
});

describe("friendlyGoogleError", () => {
  it("explains the usual refusals", () => {
    expect(friendlyGoogleError(429, { error: { message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessbusinessinformation.googleapis.com'" } })).toMatch(/approved this app/);
    expect(friendlyGoogleError(403, { error: { message: "My Business Account Management API has not been used in project 1 before or it is disabled." } })).toMatch(/isn't switched on/);
    expect(friendlyGoogleError(403, { error: { message: "The caller does not have permission" } })).toMatch(/owns or manages/);
    expect(friendlyGoogleError(500, {})).toBe("Google request failed (500).");
  });
});

describe("matchClient", () => {
  const clients = [
    { id: 1, name: "Sarah Mitchell" },
    { id: 2, name: "Tom Nguyen" },
    { id: 3, name: "Tom  Nguyen " },
    { id: 4, name: "José Álvarez" },
  ];
  it("matches one client with the same full name", () => {
    expect(matchClient("sarah mitchell", clients)).toBe(1);
    expect(matchClient("Jose Alvarez", clients)).toBe(4);
  });
  it("won't guess on a first name or two clients with the name", () => {
    expect(matchClient("Sarah", clients)).toBeNull();
    expect(matchClient("Tom Nguyen", clients)).toBeNull();
    expect(foldName("  O'Brien-Smith ")).toBe("o brien smith");
  });
});

describe("replyTemplates", () => {
  it("thanks happy customers and asks unhappy ones to get in touch", () => {
    expect(replyTemplates({ stars: 5, firstName: "Sarah", business: "Greenway" })[0]).toMatch(/^Hi Sarah, thank you so much for the 5-star review!.*\n\nGreenway$/s);
    expect(replyTemplates({ stars: 1, firstName: "", business: "" })[0]).toMatch(/^We're sorry/);
  });
});
