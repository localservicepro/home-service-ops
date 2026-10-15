import { popupDone } from "../../helpers/onlinePay";
import { finishCardUpdate } from "../../helpers/billing";

export async function handle(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = params.get("result") ?? "";
  let cardSaved = false;
  const sessionId = params.get("session_id");
  if (result === "card" && sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    cardSaved = await finishCardUpdate(sessionId).catch((e) => {
      console.error("Card update failed", e instanceof Error ? e.message : e);
      return false;
    });
  }
  const [title, body] =
    result === "success"
      ? ["You're subscribed", "Thanks! Your plan is active."]
      : result === "cancelled"
        ? ["Checkout cancelled", "No charge was made."]
        : result === "card"
          ? cardSaved
            ? ["Card updated", "Your new card will be used for future payments."]
            : ["Card not saved", "Something went wrong saving your card. Please try again."]
          : ["Billing updated", "Your changes have been saved."];
  return popupDone({ title, message: body, type: "BILLING_DONE", extra: { result } });
}
