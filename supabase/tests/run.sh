#!/usr/bin/env bash
# Runs the migration + RLS test against a throwaway local Postgres database
# (Supabase's auth/storage schemas are stubbed in 00_local_stubs.sql).
# Usage: PGURL=postgres://postgres@localhost/postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL=${PGURL:-postgres://postgres@localhost/postgres}
psql "$PGURL" -q -c 'drop database if exists hso_test' -c 'create database hso_test'
DB=${PGURL%/*}/hso_test
psql "$DB" -q -v ON_ERROR_STOP=1 -f tests/00_local_stubs.sql
for f in migrations/*.sql; do psql "$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DB" -f tests/rls_test.sql
