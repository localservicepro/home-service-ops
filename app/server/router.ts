import { routes } from "./routes.gen";

// Entry for every API request. Requests arrive as /functions/v1/api/<route> (hosted) or
// /api/<route> (inside the function); <route> matches app/endpoints/<route>_<METHOD>.ts.

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};

export function routeOf(pathname: string) {
  const i = pathname.indexOf("/api/");
  return (i >= 0 ? pathname.slice(i + 5) : pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const route = routeOf(new URL(request.url).pathname);
  const mod = routes[`${request.method} ${route}`];
  let res: Response;
  if (!mod) {
    res = new Response(JSON.stringify({ json: { error: "Not found" } }), { status: 404, headers: { "Content-Type": "application/json" } });
  } else {
    try {
      res = await mod.handle(request);
    } catch (e) {
      console.error(`[api] ${route}`, e);
      res = new Response(JSON.stringify({ json: { error: "Something went wrong. Please try again." } }), { status: 500 });
    }
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
