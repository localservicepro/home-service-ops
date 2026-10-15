// Supabase Edge Function entry (Deno). Bundled by scripts/build-api.mjs.
import { sql } from "kysely";
import { handleRequest } from "./router";
import { db } from "../helpers/db";
import { warmAuthKeys } from "../helpers/getServerUserSession";

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

// A fresh worker opens its database connection and loads the token keys straight away, so the
// first request doesn't wait for them one after the other.
sql`select 1`.execute(db).catch(() => undefined);
warmAuthKeys();

Deno.serve(handleRequest);
