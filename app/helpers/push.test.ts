import { describe, it, expect } from "vitest";
import { fcmMessage, pemToDer, readPushPrefs, readServiceAccount } from "./push";

describe("push prefs", () => {
  it("defaults every alert to on", () => {
    expect(readPushPrefs(null)).toEqual({ leads: true, quotes: true, payments: true, jobs: true });
    expect(readPushPrefs("x")).toEqual({ leads: true, quotes: true, payments: true, jobs: true });
  });
  it("only false turns an alert off", () => {
    expect(readPushPrefs({ leads: false, quotes: 0, payments: "no", jobs: true })).toEqual({ leads: false, quotes: true, payments: true, jobs: true });
  });
});

describe("service account", () => {
  it("needs email, key and project", () => {
    expect(readServiceAccount(undefined)).toBeNull();
    expect(readServiceAccount("not json")).toBeNull();
    expect(readServiceAccount(JSON.stringify({ client_email: "a@b", project_id: "p" }))).toBeNull();
    expect(readServiceAccount(JSON.stringify({ client_email: "a@b", project_id: "p", private_key: "k" }))?.project_id).toBe("p");
  });

  it("reads a PKCS#8 key from the JSON (including escaped newlines) for signing", async () => {
    const kp = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
    for (const pem of [`-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, `-----BEGIN PRIVATE KEY-----\\n${b64.replace(/\n/g, "\\n")}\\n-----END PRIVATE KEY-----\\n`]) {
      const key = await crypto.subtle.importKey("pkcs8", pemToDer(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      const data = new TextEncoder().encode("hello");
      const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
      expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", kp.publicKey, sig, data)).toBe(true);
    }
  });
});

describe("fcm message", () => {
  it("targets the alerts channel with the app's icon and the tap path", () => {
    const m = fcmMessage("tok", { title: "New enquiry", body: "Jane · Mowing", url: "/jobs/5" });
    expect(m.message.token).toBe("tok");
    expect(m.message.notification).toEqual({ title: "New enquiry", body: "Jane · Mowing" });
    expect(m.message.data).toEqual({ url: "/jobs/5" });
    expect(m.message.android.notification.channel_id).toBe("alerts");
    expect(m.message.android.notification.icon).toBe("ic_stat_notify");
  });
  it("defaults the tap path to home and trims long text", () => {
    const m = fcmMessage("t", { title: "x".repeat(200), body: "y".repeat(600) });
    expect(m.message.data.url).toBe("/");
    expect(m.message.notification.title.length).toBe(120);
    expect(m.message.notification.body.length).toBe(400);
  });
});
