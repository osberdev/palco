#!/bin/sh
# PALCO para Linux y macOS: comprueba Docker, genera el .env la primera vez,
# levanta el sistema con compose.app.yml y abre el navegador.
#
#   ./palco.sh            arranca PALCO
#   ./palco.sh detener    lo detiene sin borrar los datos
#
# Variables opcionales: PALCO_PORT (3000), PALCO_TZ (America/Mexico_City) y
# PALCO_PROJECT (palco-app), el nombre del proyecto de Docker Compose.
set -eu

cd "$(dirname "$0")"
PORT="${PALCO_PORT:-3000}"
PROJECT="${PALCO_PROJECT:-palco-app}"
URL="http://localhost:$PORT"
export PALCO_PORT="$PORT"

compose() { docker compose -p "$PROJECT" -f compose.app.yml "$@"; }

fail() {
  echo
  echo "ERROR: $1"
  echo "Últimas líneas del registro de cada servicio:"
  for service in db init app; do
    echo "── $service ──"
    compose logs --no-color --tail 30 "$service" 2>/dev/null || true
  done
  exit 1
}

if [ "${1:-}" = "detener" ]; then
  compose stop
  echo "PALCO se detuvo. Los datos se conservan."
  exit 0
fi

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "No se encontró Docker. Instala Docker Desktop (https://www.docker.com/products/docker-desktop/) y vuelve a ejecutar este script."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker está instalado pero el motor no responde. Abre Docker Desktop, espera a que diga que está en ejecución y vuelve a intentarlo."
  exit 1
fi

# ── .env ──────────────────────────────────────────────────────────────────────
# Solo la primera vez: con la base ya creada, otras contraseñas romperían el acceso.
hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
b64() { head -c "$1" /dev/urandom | base64 | tr -d '\n'; }

if [ ! -f .env ]; then
  echo "Primer arranque: generando .env con claves nuevas…"
  admin=$(hex 24); app=$(hex 24); reader=$(hex 24)
  session=$(b64 32); signing=$(b64 32); pin=$(hex 4)
  umask 077
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      POSTGRES_PASSWORD=) printf '%s\n' "POSTGRES_PASSWORD=$admin" ;;
      PALCO_APP_PASSWORD=) printf '%s\n' "PALCO_APP_PASSWORD=$app" ;;
      PALCO_LECTOR_PASSWORD=) printf '%s\n' "PALCO_LECTOR_PASSWORD=$reader" ;;
      NUXT_DATABASE_URL=) printf '%s\n' "NUXT_DATABASE_URL=postgres://palco_app:$app@db:5432/palco" ;;
      NUXT_DATABASE_READER_URL=) printf '%s\n' "NUXT_DATABASE_READER_URL=postgres://palco_lector:$reader@db:5432/palco" ;;
      NUXT_DATABASE_ADMIN_URL=) printf '%s\n' "NUXT_DATABASE_ADMIN_URL=postgres://palco_admin:$admin@db:5432/palco" ;;
      NUXT_SESSION_PASSWORD=) printf '%s\n' "NUXT_SESSION_PASSWORD=$session" ;;
      NUXT_TICKET_SIGNING_KEY=) printf '%s\n' "NUXT_TICKET_SIGNING_KEY=$signing" ;;
      NUXT_GATE_PIN=) printf '%s\n' "NUXT_GATE_PIN=$pin" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < .env.example > .env
  umask 022
else
  echo "Usando el .env existente."
fi

# ── Arranque ──────────────────────────────────────────────────────────────────
echo "Construyendo y arrancando PALCO (la primera vez tarda unos minutos)…"
compose up -d --build || fail "Docker Compose no pudo arrancar los servicios."

echo "Esperando a que $URL responda…"
tries=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/login" 2>/dev/null)" = "200" ]; do
  tries=$((tries + 1))
  state=$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$(compose ps -aq init)" 2>/dev/null || echo "")
  case "$state" in exited\ 0|"") ;; exited*) fail "La inicialización de la base falló." ;; esac
  [ "$tries" -ge 150 ] && fail "PALCO no respondió en 5 minutos."
  sleep 2
done

pin=$(sed -n 's/^NUXT_GATE_PIN=//p' .env)
cat <<EOF

PALCO está listo en $URL

Usuarios de demostración (usuario: CURP, y contraseña):
  Ana Sofía Ríos Vela   RIVA030315MJCSLNA2JC   !Palco26
  Bruno Téllez Nava     TENB010908HCMLVRA6CM   Teatro9\$
  Carmen Ibarra Solís   IASC951122MQTBLR02QT   Cine#204
  Diego Méndez          MEXD980704HNLNXG10NL   Museo\$7A

Clave de la taquilla ($URL/acceso): $pin

Para detenerlo:            ./palco.sh detener
Para borrar también datos: docker compose -p $PROJECT -f compose.app.yml down -v
EOF

# In the background: without a configured browser, xdg-open can wait forever.
if command -v xdg-open >/dev/null 2>&1; then (xdg-open "$URL" >/dev/null 2>&1 &)
elif command -v open >/dev/null 2>&1; then open "$URL" || true
fi
