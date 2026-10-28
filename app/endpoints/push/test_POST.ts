import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isPushConfigured, pushToUsers } from "../../helpers/push";
import { errorResponse } from "../../helpers/tenant";
import { schema, OutputType } from "./test_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    schema.parse(superjson.parse(await request.text()));
    if (!isPushConfigured()) throw new Error("Push notifications aren't set up for this app yet.");
    const r = await pushToUsers([user.id], { title: "Notifications are on", body: "This is how new enquiries, quote replies and payments will show up.", url: "/settings" });
    const devices = r.sent + r.failed;
    if (!devices) throw new Error("No phone is set up yet. Open the Android app and allow notifications.");
    if (!r.sent) throw new Error(r.error ?? "Firebase didn't accept the notification.");
    return new Response(superjson.stringify({ sent: r.sent, devices } satisfies OutputType));
  } catch (error) {
    return errorResponse(error);
  }
}
