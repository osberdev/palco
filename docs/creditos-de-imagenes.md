# Créditos de imágenes y fuentes

## Ilustraciones y fotografías

Todas las imágenes del repositorio son de autoría propia del autor del proyecto.

| Archivo | Tamaño | Peso | Uso |
|---|---|---|---|
| `public/img/login-ambient.jpg` | 1600×2143 | 394 KB | Panel ambiental de las pantallas de acceso y registro |
| `public/img/teatro.jpg` | 1800×1208 | 285 KB | Imagen de la categoría Teatro: inicio, catálogo, compra, confirmación y lista de boletos |
| `public/img/cine.jpg` | 1800×1208 | 230 KB | Imagen de la categoría Cine, en las mismas pantallas |
| `public/img/museo.jpg` | 1800×1208 | 209 KB | Imagen de la categoría Museo, en las mismas pantallas |
| `public/img/estado-vacio.jpg` | 400×400 | 4.2 KB | Ilustración del estado vacío de `/boletos` |
| `public/img/textura-confirmacion.jpg` | 1600×1600 | 18 KB | Textura de fondo prevista para la confirmación; hoy ninguna pantalla la usa |
| `assets/img/estado-error.jpg` | 400×400 | 3.7 KB | Ilustración por omisión de `ErrorState` y de `PurchaseNotFound` |

### Por qué unas viven en `public/` y otra en `assets/`

Las imágenes de `public/img/` se piden por URL y no pasan por el empaquetador. Si
falta una, la superficie que la usa muestra el color de fondo de su categoría
(`--teatro-subtle`, `--cine-subtle`, `--museo-subtle` o, en el panel de acceso,
`--ink-900`) en lugar de romper la compilación.

`estado-error.jpg` vive en `assets/img/` porque el estado de error no puede depender
de la red: aparece justo cuando una petición falló, y si la red está caída una imagen
pedida por URL no carga, salvo que el navegador la tenga en caché. Los componentes la
importan con `?inline`, que la incrusta como data URI al compilar, sin depender del
umbral `assetsInlineLimit`.

## Fuentes

Las fuentes tipográficas se distribuyen bajo la SIL Open Font License, versión 1.1.
Cada licencia acompaña a sus archivos en `server/assets/fonts/`:

| Familia | Archivos | Licencia |
|---|---|---|
| Geist | `Geist-Regular.ttf`, `Geist-Medium.ttf`, `Geist-600.ttf` | `server/assets/fonts/Geist-OFL.txt` |
| Geist Mono | `GeistMono-Regular.ttf`, `GeistMono-Medium.ttf` | `server/assets/fonts/Geist-OFL.txt` (mismo proyecto Geist) |
| Instrument Serif | `InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.woff` | `server/assets/fonts/InstrumentSerif-OFL.txt` |

El servidor publica esa carpeta en `/fonts`, y las mismas fuentes se usan en la
interfaz y en los PDF de los boletos.
