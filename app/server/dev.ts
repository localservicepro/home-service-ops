// Local development only: the api function plus a minimal stand-in for Supabase Storage's
// signed uploads, on http://localhost:8787. Built with `node scripts/build-api.mjs --dev <out>`.
import { handleRequest } from "./router";

declare const Deno: {
  serve: (opts: { port: number }, handler: (request: Request) => Response | Promise<Response>) => void;
  mkdir: (p: string, o: { recursive: boolean }) => Promise<void>;
  writeFile: (p: string, d: Uint8Array) => Promise<void>;
  readFile: (p: string) => Promise<Uint8Array>;
};

const ROOT = "/tmp/hso-storage";
const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

Deno.serve({ port: 8787 }, async (request) => {
  const url = new URL(request.url);
  const p = url.pathname;
  const sign = /^\/storage\/v1\/object\/upload\/sign\/(.+)$/.exec(p);
  if (sign && request.method === "POST") return Response.json({ url: `/object/upload/sign/${sign[1]}?token=dev` });
  if (sign && request.method === "PUT") {
    const file = `${ROOT}/${decodeURIComponent(sign[1])}`;
    await Deno.mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    await Deno.writeFile(file, new Uint8Array(await request.arrayBuffer()));
    return Response.json({ Key: sign[1] });
  }
  const pub = /^\/storage\/v1\/object\/public\/(.+)$/.exec(p);
  if (pub) {
    try {
      const data = await Deno.readFile(`${ROOT}/${decodeURIComponent(pub[1])}`);
      return new Response(data as unknown as BodyInit, { headers: { "Content-Type": types[pub[1].split(".").pop() ?? ""] ?? "application/octet-stream" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }
  return handleRequest(request);
});
console.log("api listening on http://localhost:8787");
