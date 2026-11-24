#!/bin/sh
# Creates the PALCO roles. The image runs this only on an empty volume:
# changing a password later requires ALTER ROLE or `docker compose down -v`,
# which deletes the data. The GRANTs live in schema.sql because they need the tables.
set -eu

# \getenv rather than -v on the command line keeps the password out of the
# process list. :'var' quotes it as an SQL literal.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password PALCO_APP_PASSWORD
\getenv lector_password PALCO_LECTOR_PASSWORD
CREATE ROLE palco_app LOGIN PASSWORD :'app_password';
CREATE ROLE palco_lector LOGIN PASSWORD :'lector_password';
-- Segundo cerrojo del lector, además de no tener privilegios de escritura.
ALTER ROLE palco_lector SET default_transaction_read_only = on;
SQL
