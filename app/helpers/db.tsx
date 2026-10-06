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

const url = env("SUPABASE_DB_URL") ?? env("DATABASE_URL");

export const db = new Kysely<DB>({
  plugins: [new HsoCamelCasePlugin()],
  dialect: new PostgresJSDialect({
    postgres: postgres(url ?? "postgres://localhost/postgres", {
      prepare: false,
      idle_timeout: 10,
      max: 3,
    }),
  }),
}).withSchema("hso");
