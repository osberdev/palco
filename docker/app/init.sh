#!/bin/sh
# One-shot initialization for compose.app.yml. Safe to run on every start: the
# schema and the seed users are idempotent, and the sample purchases are only
# inserted while the database has none, because db:seed:demo refuses otherwise.
set -eu
cd /app
run() { node --import ./scripts/resolve-ts.ts "scripts/$1"; }

run db-init.ts
run db-seed.ts

purchases=$(node --input-type=module -e "
import pg from 'pg'
const client = new pg.Client({ connectionString: process.env.NUXT_DATABASE_ADMIN_URL })
await client.connect()
const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM purchases')
await client.end()
console.log(rows[0].n)
")

if [ "$purchases" -eq 0 ]; then
  run db-seed-demo.ts
else
  echo "La base ya tiene $purchases compras: no se agregan las de demostración."
fi
