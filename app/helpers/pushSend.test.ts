import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

// db stub: two devices for the user; records deletions.
const deleted: unknown[] = [];
vi.mock("./db", () => {
  const chain = (rows: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "where", "innerJoin"]) c[m] = () => c;
    c.execute = async () => rows;
    return c;
  };
  return {
    db: {
      selectFrom: () => chain([{ id: 1, token: "good-token" }, { id: 2, token: "gone-token" }]),
      deleteFrom: () => {
        const c: Record<string, unknown> = {};
        c.where = (_col: string, _op: string, v: unknown) => (deleted.push(v), c);
        c.execute = async () => [];
        return c;
      },
    },
  };
});

let pem = "";
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({ client_email: "fcm@proj.iam.gserviceaccount.com", private_key: pem, project_id: "proj-123" });
});
afterEach(() => vi.unstubAllGlobals());

describe("pushToUsers", () => {
  it("signs in to Google, sends to each phone and drops tokens Firebase says are gone", async () => {
    const calls: { url: string; body: string; auth?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: (init.headers as Record<string, string>)?.Authorization });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at-1", expires_in: 3600 }));
      const msg = JSON.parse(String(init.body)) as { message: { token: string } };
      if (msg.message.token === "gone-token") return new Response(JSON.stringify({ error: { status: "NOT_FOUND", message: "Requested entity was not found." } }), { status: 404 });
      return new Response(JSON.stringify({ name: "projects/proj-123/messages/1" }));
    });
    const { pushToUsers } = await import("./push");
    const r = await pushToUsers([7], { title: "Hi", body: "There", url: "/jobs/1" });
    expect(r).toMatchObject({ sent: 1, failed: 1 });

    const tokenCall = calls[0];
    expect(tokenCall.url).toBe("https://oauth2.googleapis.com/token");
    const assertion = new URLSearchParams(tokenCall.body).get("assertion")!;
    const claims = JSON.parse(atob(assertion.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(claims).toMatchObject({ iss: "fcm@proj.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/firebase.messaging" });

    const sends = calls.filter((c) => c.url.includes("fcm.googleapis.com"));
    expect(sends).toHaveLength(2);
    expect(sends[0].url).toBe("https://fcm.googleapis.com/v1/projects/proj-123/messages:send");
    expect(sends[0].auth).toBe("Bearer at-1");
    expect(deleted).toContainEqual([2]);
  });
});
