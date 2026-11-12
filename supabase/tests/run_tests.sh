#!/usr/bin/env bash
# Uso: PSQL="psql -h /ruta -p 54329 -U postgres" ./run_tests.sh
# Crea una base limpia, aplica el shim, las migraciones y las pruebas de permisos.
set -euo pipefail
PSQL="${PSQL:-psql -U postgres}"
DB="mercado_extra_test"
DIR="$(cd "$(dirname "$0")" && pwd)"
$PSQL -d postgres -q -c "drop database if exists $DB"
# los roles son globales: se recrean en cada corrida
$PSQL -d postgres -q -c "drop role if exists anon" -c "drop role if exists authenticated" -c "drop role if exists service_role" 2>/dev/null || true
$PSQL -d postgres -q -c "create database $DB"
$PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$DIR/00_shim_supabase.sql"
for f in "$DIR"/../migrations/*.sql; do
  echo "→ migración $(basename "$f")"
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f"
done
$PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$DIR/01_rls_tests.sql"
