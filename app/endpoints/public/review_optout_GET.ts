import { popupDone } from "../../helpers/onlinePay";
import { db } from "../../helpers/db";

const page = (title: string, body: string) => popupDone({ title, message: body, ok: !/not valid/i.test(title) });

export async function handle(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^[a-f0-9]{36}$/.test(t)) return page("Link not valid", "This unsubscribe link isn't valid.");
  const r = await db.updateTable("clients").set({ reviewOptOut: true }).where("reviewToken", "=", t).executeTakeFirst();
  if (!Number(r.numUpdatedRows)) return page("Link not valid", "This unsubscribe link isn't valid any more.");
  return page("You're unsubscribed", "You won't receive any more review request emails from this business.");
}
