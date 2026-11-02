import { env } from "./serverEnv";
import { verifySignature } from "./salesBrainInbound";

// Server-only: the check every read-only endpoint Sales Brain calls goes through. A GET has no
// body, so the signed string is "<timestamp>." (HMAC-SHA256 with LSP_APP_SHARED_SECRET).

export const jsonReply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** A response to send back when the request isn't from Sales Brain, else null. */
export function refuseUnlessSalesBrain(request: Request): Response | null {
  const secret = env("LSP_APP_SHARED_SECRET");
  if (!secret) return jsonReply(503, { error: "Not set up yet" });
  const sig = verifySignature(secret, request.headers.get("x-lsp-timestamp"), request.headers.get("x-lsp-signature"), "");
  return sig.ok ? null : jsonReply(401, { error: sig.error });
}

/** Runs the read; a failure on our side is a 503 with nothing about the cause. */
export async function serveRead(label: string, read: () => Promise<Response>) {
  try {
    return await read();
  } catch (e) {
    console.error(`[salesbrain ${label}] failed`, e instanceof Error ? e.message : e);
    return jsonReply(503, { error: "Temporary problem on our side. Try again shortly." });
  }
}
