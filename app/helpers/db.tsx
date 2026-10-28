import { CamelCasePlugin, Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import { DB, kyselyIdentifierOverrides } from "./schema";
import { env } from "./serverEnv";

// Server-only. Supabase Postgres, schema `hso`. SUPABASE_DB_URL is injected into Edge Functions.

// kysely's CamelCasePlugin can't recover a snake_case name that has an underscore directly
// before a digit; the schema exports the exact spelling for such identifiers.
class HsoCamelCasePlugin extends CamelCasePlugin {
  protected override snakeCase(str: string): string {
    return kyselyIdentifierOverrides[str] ?? super.snakeCase(str);
  }
}

/**
 * Connect through the project's transaction pooler (PgBouncer, port 6543) rather than straight
 * to Postgres. Each Edge Function worker opens its own connections; direct ones run into
 * Postgres's connection limit when many workers are alive ("remaining connection slots are
 * reserved…"), while the pooler shares a small set of real connections. DB_POOL=off opts out.
 */
function databaseUrl() {
  const raw = env("SUPABASE_DB_URL") ?? env("DATABASE_URL");
  if (!raw || env("DB_POOL") === "off") return raw;
  try {
    const u = new URL(raw);
    if (/^db\.[a-z0-9]+\.supabase\.co$/.test(u.hostname) && (u.port === "" || u.port === "5432")) {
      u.port = "6543";
      return u.toString();
    }
  } catch {
    /* not a URL; use as given */
  }
  return raw;
}

const url = databaseUrl();

export const db = new Kysely<DB>({
  plugins: [new HsoCamelCasePlugin()],
  dialect: new PostgresJSDialect({
    postgres: postgres(url ?? "postgres://localhost/postgres", {
      // Transaction pooling: no prepared statements; a couple of short-lived connections per worker.
      prepare: false,
      idle_timeout: 20,
      max: 2,
    }),
  }),
}).withSchema("hso");
