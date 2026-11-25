# PALCO

PALCO es un sistema web de venta de boletos para eventos culturales en doce recintos de siete países: teatros, cines y museos. Cada compra valida en el servidor el horario y los días de apertura del recinto, los límites de boletos por usuario y fecha, la disponibilidad y el pago (tarjeta de débito o crédito, o PayPal). Emite boletos con QR firmado y código corto, los entrega en PDF y, con la configuración de Meta, por WhatsApp. La taquilla (`/acceso`) admite cada boleto una sola vez, en su fecha y dentro del horario del recinto.

## Requisitos

Solo [Docker Desktop](https://www.docker.com/products/docker-desktop/), abierto y en ejecución. No hace falta instalar Node, bun ni PostgreSQL.

## Cómo ejecutarlo

1. Descarga el código (`Code` → `Download ZIP`, o el `.zip` del Release) y descomprímelo.
2. **Windows:** doble clic en `PALCO.bat`.
   **Linux o macOS:** en una terminal, dentro de la carpeta, `./palco.sh`.
3. La primera vez construye la imagen y tarda unos minutos. Al terminar abre `http://localhost:3000` en el navegador y muestra las credenciales.

En el primer arranque el lanzador genera un archivo `.env` con contraseñas y claves nuevas, únicas para tu equipo. Los arranques siguientes lo reutilizan: no lo borres mientras quieras conservar los datos.

Para usar otro puerto: `set PALCO_PORT=3100` antes de `PALCO.bat` en Windows, o `PALCO_PORT=3100 ./palco.sh`.

## Usuarios de demostración

Son personas sintéticas; el usuario es una CURP de 20 caracteres.

| Nombre | Usuario | Contraseña |
|---|---|---|
| Ana Sofía Ríos Vela | `RIVA030315MJCSLNA2JC` | `!Palco26` |
| Bruno Téllez Nava | `TENB010908HCMLVRA6CM` | `Teatro9$` |
| Carmen Ibarra Solís | `IASC951122MQTBLR02QT` | `Cine#204` |
| Diego Méndez | `MEXD980704HNLNXG10NL` | `Museo$7A` |

La base arranca con cinco compras de ejemplo. La **clave de la taquilla** se genera en el primer arranque: el lanzador la muestra al final, y está en el `.env` como `NUXT_GATE_PIN`.

## Qué no funciona sin configuración

- **Envío por WhatsApp.** Necesita credenciales de la plataforma de WhatsApp Business de Meta (`NUXT_WHATSAPP_*` en `.env`). Sin ellas la interfaz dice que el envío no está disponible; el PDF y la opción de compartir siguen funcionando. `docs/meta-simulado.md` explica cómo probarlo con un servidor local que imita a Meta.
- **Taquilla.** Solo admite boletos **de hoy**, en un recinto **abierto en ese momento**, según su horario. Para probarla, compra un boleto para hoy en un recinto que esté abierto (por ejemplo, Cinemark o AMC, de 10:30 a 23:59) y abre `/acceso` con la clave de la taquilla.

La zona horaria es `America/Mexico_City`; se cambia con `PALCO_TZ`.

## Detenerlo y borrar los datos

- **Detener**, conservando los datos: `PALCO.bat detener` o `./palco.sh detener`.
- **Borrar todo** (base, compras y usuarios registrados):
  `docker compose -p palco-app -f compose.app.yml down -v`, y borra el `.env` para que el siguiente arranque genere claves nuevas.

## Desarrollo

Requiere [bun](https://bun.sh) 1.3, Node 24 y Docker para PostgreSQL. Copia `.env.example` como `.env` y llena sus valores; cada variable explica cómo generarse.

```bash
bun install
bun run db:up            # PostgreSQL en Docker (puerto 55432)
bun run db:init          # esquema y recintos
bun run db:seed          # los cuatro usuarios
bun run db:seed:demo     # compras de ejemplo
bun run dev              # servidor de desarrollo
bun run build && bun run start
```

Pruebas y revisiones:

```bash
bun run test             # pruebas unitarias y de integración, sobre PGlite
bun run test:concurrency # carreras reales contra PostgreSQL
bun run typecheck
bun run lint
bun run db:evidence      # informe de consistencia de la base, de solo lectura
```

**Tecnologías:** Nuxt 3 y Vue 3 con TypeScript, Pinia, PostgreSQL 18 con `pg`, PGlite para las pruebas, Vitest, pdfmake para los boletos, Ed25519 para firmar los QR, `libphonenumber-js` y la API de WhatsApp Business.

## Estructura

`pages/`, `layouts/`, `components/`, `composables/` y `stores/` son la interfaz; `utils/` es la presentación compartida. `server/domain/` contiene las reglas de negocio como funciones puras, sin reloj ni base de datos; `server/api/` son los endpoints, `server/db/` el esquema y los repositorios, `server/utils/` y `server/plugins/` la infraestructura del servidor, y `server/data/` el catálogo semilla. `scripts/` tiene las tareas de base de datos y de verificación, `tests/` las pruebas y `docker/` la inicialización de PostgreSQL y del contenedor de la aplicación.

## Documentación

La documentación está en [`docs/`](docs/).
