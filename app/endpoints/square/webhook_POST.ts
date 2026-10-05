import { handleSquareEvent, verifySquareSignature } from "../../helpers/squareConnect";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(request: Request) {
  const raw = await request.text();
  try {
    verifySquareSignature(raw, request.headers.get("x-square-hmacsha256-signature"));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Invalid signature" }, 401);
  }
  try {
    const result = await handleSquareEvent(JSON.parse(raw));
    return json({ received: true, result });
  } catch (e) {
    console.error("Square webhook failed", e instanceof Error ? e.message : e);
    return json({ error: "Processing failed" }, 500);
  }
}
