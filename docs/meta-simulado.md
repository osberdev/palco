# Meta simulado

`scripts/mock-meta.mjs` es un servidor local que imita a la plataforma de
WhatsApp Business de Meta. Sirve para mostrar los estados del envío de boletos,
incluidos los fallos, sin depender de Meta ni gastar envíos reales.

- **Es independiente.** La aplicación no lo importa y no tiene ningún «modo
  falso»: habla con él exactamente como con Meta, porque solo cambia la
  dirección base de la API.
- **Imita solo lo que usa el cliente** (`server/utils/whatsapp-client.ts`):
  `POST /{versión}/{phone-number-id}/media`, la subida del PDF, y
  `POST /{versión}/{phone-number-id}/messages`, el envío de la plantilla.
  Acepta cualquier versión `vN.N` y exige una cabecera `Authorization: Bearer
  …`, sin validar el token.
- **No guarda ni escribe datos.** Consume y descarta el cuerpo de cada
  petición. Escribe una línea por petición con la hora, el método, la ruta, el
  estado y la duración; el id del número de envío sale como
  `{phone-number-id}`. Nunca escribe el token, el número de destino ni el PDF.

## Comandos

En una terminal, el servidor simulado con el escenario que se quiere mostrar:

```bash
node scripts/mock-meta.mjs ok                 # o unreachable, permanent, transient-then-ok, slow
node scripts/mock-meta.mjs ok --port 3902     # otro puerto; 3901 por omisión
```

En otra terminal, la aplicación compilada apuntando a él. La variable va en la
línea de comandos y **no se toca el `.env`**:

```bash
bun run build
NUXT_WHATSAPP_API_BASE=http://127.0.0.1:3901 bun run start
```

`bun run start` arranca Node con `--env-file-if-exists=.env`, y Node no
sobrescribe con el `.env` una variable que ya está en el entorno: el valor de la
línea de comandos es el que se usa.

Las demás variables de Meta (token, número de envío, plantilla e idioma) se
siguen leyendo del `.env`: el servidor simulado no las valida, y como corre en
`127.0.0.1` no salen de la computadora. Sin ellas el envío no está disponible.

`NUXT_WHATSAPP_API_BASE` solo admite `https://`, o `http://` hacia `127.0.0.1`
o `localhost`, con cualquier puerto, sin ruta, usuario ni consulta. Un
`http://` remoto llevaría el token en claro; con otro valor, el servidor lo
advierte al arrancar y el envío queda no disponible.

Para volver a Meta basta con arrancar sin la variable: `bun run start`.

## Qué estado de la pantalla produce cada escenario

Los estados se ven en la tarjeta «Tus boletos» de la confirmación, con un
WhatsApp registrado en el perfil. Cada compra confirmada dispara el envío
automático; «Enviar a WhatsApp» y «Reintentar» lo repiten.

| Estado | Cómo se produce |
|---|---|
| Enviando tus boletos… | `slow`: el envío tarda 4 segundos en aceptarse. También se ve durante los reintentos de `transient-then-ok` |
| Boletos enviados | `ok` |
| No pudimos enviar, sin conexión | El servidor simulado **detenido**: tres intentos sin respuesta, con pausas de 2 y 8 segundos (RN-ENV-03) |
| No pudimos enviar, `WhatsApp 132001` | `permanent`: no se reintenta |
| Ya enviaste estos boletos 3 veces | `ok` y cuatro envíos de la misma compra en una hora, contando el automático: el cuarto responde 429 (RN-ENV-04) |
| El envío no está disponible | Arrancar la aplicación **sin** las variables de Meta; no depende del servidor simulado |
| Este número aún no puede recibir mensajes de PALCO | `unreachable`: código 131030, sin reintentos |
| Reintento transitorio | `transient-then-ok`: dos 500 con el código 1, con pausas de 2 y 8 segundos, y aceptado al tercer intento |

El contador de `transient-then-ok` es del proceso: los dos primeros envíos que
recibe fallan y los siguientes se aceptan. Para repetir la demostración,
reinícialo.

**Para medir las pausas, usa un reloj monótono.** En WSL el reloj de pared
puede saltar varios cientos de milisegundos en medio minuto, y una pausa medida
con `Date.now()` sale más corta de lo que fue. El servidor simulado mide sus
duraciones con `performance.now()`.

El límite de tres envíos por hora vive en la memoria de la aplicación y se
reinicia con ella: para mostrar «Ya enviaste estos boletos 3 veces» no hay que
reiniciar la aplicación entre envíos.
