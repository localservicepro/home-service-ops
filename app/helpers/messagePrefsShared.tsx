// Shared by the browser and the api: how a business sends each kind of client message.

export type Channel = "email" | "sms" | "both";
export type MessageKind = "quotes" | "invoices" | "reviews" | "reminders";
export type MessagePrefs = Record<MessageKind, Channel>;

export const MESSAGE_KINDS: MessageKind[] = ["quotes", "invoices", "reviews", "reminders"];
export const DEFAULT_MESSAGE_PREFS: MessagePrefs = { quotes: "email", invoices: "email", reviews: "email", reminders: "email" };

const isChannel = (x: unknown): x is Channel => x === "email" || x === "sms" || x === "both";

/**
 * Saved prefs, or (for businesses that set this before it moved to Settings) the SMS Gateway
 * card's old choices: docsDefault for quotes and invoices, reviews for review requests.
 */
export function readMessagePrefs(raw: unknown, legacy?: { docsDefault?: unknown; reviews?: unknown } | null): MessagePrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (k: MessageKind, old: unknown): Channel => (isChannel(o[k]) ? (o[k] as Channel) : isChannel(old) ? old : DEFAULT_MESSAGE_PREFS[k]);
  return {
    quotes: pick("quotes", legacy?.docsDefault),
    invoices: pick("invoices", legacy?.docsDefault),
    reviews: pick("reviews", legacy?.reviews),
    reminders: pick("reminders", undefined),
  };
}

/** What actually goes out: without SMS Gateway, everything is email. */
export const effectiveChannel = (c: Channel, smsReady: boolean): Channel => (smsReady ? c : "email");
