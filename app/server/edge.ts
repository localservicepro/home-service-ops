// Supabase Edge Function entry (Deno). Bundled by scripts/build-api.mjs.
import { handleRequest } from "./router";

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

Deno.serve(handleRequest);
