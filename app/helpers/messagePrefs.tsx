import { db } from "./db";
import { readMessagePrefs, type MessagePrefs } from "./messagePrefsShared";
import { smsState } from "./sms";

// Server-only. A business's saved Email / SMS / Both choices, and whether texts can go out.
export async function getMessagePrefs(businessId: number): Promise<{ prefs: MessagePrefs; smsReady: boolean; smsConnected: boolean }> {
  const [s, conn, sms] = await Promise.all([
    db.selectFrom("settings").select("messagePrefs").where("businessId", "=", businessId).executeTakeFirst(),
    db.selectFrom("smsConnection").select("prefs").where("businessId", "=", businessId).executeTakeFirst(),
    smsState(businessId),
  ]);
  const legacy = conn?.prefs && typeof conn.prefs === "object" ? (conn.prefs as { docsDefault?: unknown; reviews?: unknown }) : null;
  return { prefs: readMessagePrefs(s?.messagePrefs, legacy), smsReady: sms.ready, smsConnected: !!conn };
}
