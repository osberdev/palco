-- PALCO · Consultas de verificación de la base de datos, en PostgreSQL
--
-- Cómo correrlas. En un cliente gráfico (por ejemplo, TablePlus): conexión PostgreSQL
-- a 127.0.0.1, puerto 55432, base `palco`, usuario `palco_lector` y su contraseña del
-- `.env`, con SSL «Disabled» o «Preferred». Se abre este archivo y se corre cada
-- consulta con el cursor en ella, o todas a la vez. En la terminal:
-- `psql "$NUXT_DATABASE_READER_URL" -f docs/consultas.sql`.
--
-- Todas son de solo lectura, y el rol también: `palco_lector` no escribe nada, y no
-- puede leer el número de WhatsApp ni los bytes de la foto. Ninguna consulta los
-- pide: esas dos tablas se leen por las vistas `whatsapp_status` y
-- `profile_photo_summary`. Ninguna imprime el hash completo de una contraseña, el
-- titular de una tarjeta, el correo de PayPal ni un correo de usuario fuera de los
-- dominios reservados para pruebas (RNF-14, RNF-15, RN-CON-05).
--
-- Formato, del que depende CQ1 (tests/consultas.test.ts): cada consulta empieza con
-- una línea `-- @consulta nombre` y es una sola sentencia. Una línea `-- espera: N
-- filas` antes de ella fija cuántas filas devuelve con `db:seed` y `db:seed:demo`, sin
-- WhatsApp ni fotos; las de consistencia esperan 0. CQ1 corre cada una como
-- `palco_lector` sobre esa semilla y falla si alguna falla o devuelve otra cantidad.


-- ══ Contraseñas con hash en la base ═══════════════════════════════════════

-- Los usuarios. Del hash solo el prefijo del algoritmo, la longitud y el costo. El
-- correo, solo si es de un dominio reservado para pruebas (RFC 2606 y 6761): otro
-- dominio puede ser el buzón real de una persona. Del WhatsApp, solo si hay uno, por
-- la vista.
-- @consulta usuarios
-- espera: 4 filas
SELECT u.id,
       u.display_name                              AS nombre,
       CASE
         WHEN u.email IS NULL OR u.email = '' THEN '—'
         WHEN lower(u.email) ~ '@example\.(com|net|org)$'
           OR lower(u.email) ~ '\.(test|example|invalid|localhost)$' THEN u.email
         ELSE 'registrado (dominio no reservado, oculto)'
       END                                         AS correo,
       u.username                                  AS curp,
       substr(u.password_hash, 1, 7)               AS prefijo_hash,
       length(u.password_hash)                     AS longitud_hash,
       substr(u.password_hash, 5, 2)::integer      AS costo_bcrypt,
       (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id) AS compras,
       CASE WHEN EXISTS (SELECT 1 FROM whatsapp_status w WHERE w.user_id = u.id)
            THEN 'sí' ELSE 'no' END                AS whatsapp_registrado
FROM users u
ORDER BY u.id;

-- Ningún hash que no sea bcrypt de 60 caracteres y costo 10 (RNF-14).
-- @consulta hashes_que_no_son_bcrypt
-- espera: 0 filas
SELECT id, username AS curp
FROM users
WHERE password_hash !~ '^\$2[aby]\$10\$' OR length(password_hash) <> 60;


-- ══ Usuarios, eventos y transacciones almacenados ═════════════════════════

-- El historial de un usuario: sus compras, de la más reciente a la más antigua.
-- @consulta historial_de_ana
-- espera: 2 filas
SELECT p.folio, p.venue_name AS recinto, p.quantity AS cantidad,
       p.currency || ' ' || to_char(p.total_cents / 100.0, 'FM999,999,990.00') AS total,
       p.purchased_on AS comprada
FROM purchases p JOIN users u ON u.id = p.user_id
WHERE u.username = 'RIVA030315MJCSLNA2JC'
ORDER BY p.sequence DESC;

-- El historial de todos, desde la vista purchase_history: usuarios y compras unidos
-- por la base. Un usuario sin compras no aparece. La vista no tiene el hash, la CURP,
-- el correo ni el WhatsApp.
-- @consulta historial_de_compras
-- espera: 5 filas
SELECT user_id AS usuario, display_name AS nombre, folio, venue_name AS recinto,
       to_char(event_date, 'YYYY-MM-DD') || ' ' || to_char(event_time, 'HH24:MI') AS evento,
       quantity AS cantidad,
       currency || ' ' || to_char(total_cents / 100.0, 'FM999,999,990.00') AS total
FROM purchase_history
ORDER BY user_id, folio;

-- Eventos: tipo, ubicación, capacidad, horario general y restricciones.
-- @consulta recintos
-- espera: 12 filas
SELECT id, category AS tipo, name AS nombre, city AS ciudad, jurisdiction,
       capacity AS capacidad,
       to_char(opens, 'HH24:MI') || '–' || to_char(closes, 'HH24:MI') AS horario_general,
       restrictions AS restricciones
FROM venues
ORDER BY category, id;

-- Precios por recinto, en unidades, desde la vista venue_prices: las secciones, los
-- formatos, las tarifas y el cargo por servicio, sin una segunda copia.
-- @consulta precios
-- espera: 53 filas
SELECT v.id AS recinto, vp.kind AS tipo_de_precio, vp.label AS etiqueta,
       to_char(vp.price_cents / 100.0, 'FM999,999,990.00') AS precio
FROM venue_prices vp JOIN venues v ON v.id = vp.venue_id
ORDER BY v.id, vp.kind, vp.price_cents DESC, vp.label;

-- Los horarios de cada recinto: el general, el alterno (temporada, fin de semana o
-- nocturno) y el de domingos y festivos.
-- @consulta horarios
-- espera: 12 filas
SELECT v.id AS recinto,
       to_char(v.opens, 'HH24:MI') || '–' || to_char(v.closes, 'HH24:MI') AS general,
       to_char(a.opens, 'HH24:MI') || '–' || to_char(a.closes, 'HH24:MI') AS alterno,
       to_char(d.opens, 'HH24:MI') || '–' || to_char(d.closes, 'HH24:MI') AS domingo_y_festivos
FROM venues v
JOIN venue_hours a ON a.venue_id = v.id AND a.kind = 'alternate'
JOIN venue_hours d ON d.venue_id = v.id AND d.kind = 'sunday_holiday'
ORDER BY v.position;

-- Los días de la semana que cierra cada recinto (0 = domingo) y sus cierres anuales.
-- @consulta dias_y_cierres
-- espera: 12 filas
SELECT v.id AS recinto,
       COALESCE((SELECT string_agg(w.weekday::text, ', ' ORDER BY w.weekday)
                 FROM venue_closed_weekdays w WHERE w.venue_id = v.id), '—') AS dias_de_cierre,
       COALESCE((SELECT string_agg(c.day || '/' || c.month || ' ' || c.name, ' · ' ORDER BY c.month, c.day)
                 FROM venue_annual_closures c WHERE c.venue_id = v.id), '—') AS cierres_anuales
FROM venues v
ORDER BY v.position;

-- Las excepciones de apertura y de horario de cada recinto.
-- @consulta excepciones
-- espera: 10 filas
SELECT e.venue_id AS recinto, e.policy AS excepcion
FROM venue_exceptions e JOIN venues v ON v.id = e.venue_id
ORDER BY v.position, e.policy COLLATE "C";

-- La cartelera de los teatros, en su orden.
-- @consulta obras
-- espera: 9 filas
SELECT p.venue_id AS recinto, p.position AS orden, p.title AS obra
FROM venue_plays p JOIN venues v ON v.id = p.venue_id
ORDER BY v.position, p.position;

-- La cartelera de los cines, con su clasificación y su duración.
-- @consulta peliculas
-- espera: 14 filas
SELECT f.venue_id AS recinto, f.position AS orden, f.title AS pelicula,
       f.classification AS clasificacion, f.duration_minutes AS minutos
FROM venue_films f JOIN venues v ON v.id = f.venue_id
ORDER BY v.position, f.position;

-- Las secciones de los teatros, en su orden, con su precio.
-- @consulta secciones
-- espera: 19 filas
SELECT s.venue_id AS recinto, s.position AS orden, s.name AS seccion,
       to_char(s.price_cents / 100.0, 'FM999,999,990.00') AS precio
FROM venue_sections s JOIN venues v ON v.id = s.venue_id
ORDER BY v.position, s.position;

-- Los formatos de los cines, en su orden, con su precio y sus butacas.
-- @consulta formatos
-- espera: 23 filas
SELECT f.venue_id AS recinto, f.position AS orden, f.format_id AS formato,
       to_char(f.price_cents / 100.0, 'FM999,999,990.00') AS precio, f.seats AS butacas
FROM venue_formats f JOIN venues v ON v.id = f.venue_id
ORDER BY v.position, f.position;

-- Transacciones: usuario, evento, cantidad, método, total y estado. Del resumen del
-- pago, solo el método y la marca.
-- @consulta transacciones
-- espera: 5 filas
SELECT p.folio, u.username AS usuario, p.venue_id AS recinto, p.category AS tipo,
       p.details->>'play'                   AS obra,
       p.details->'film'->>'title'          AS pelicula,
       to_char(p.event_date, 'YYYY-MM-DD') || ' ' || to_char(p.event_time, 'HH24:MI') AS evento,
       p.quantity                           AS cantidad,
       p.payment_method                     AS metodo,
       p.payment_summary->>'brand'          AS marca,
       p.currency || ' ' || to_char(p.total_cents / 100.0, 'FM999,999,990.00') AS total,
       p.status AS estado, p.purchased_on AS comprada
FROM purchases p JOIN users u ON u.id = p.user_id
ORDER BY p.sequence;

-- Boletos: un identificador único por boleto. El código corto con guiones lo
-- calcula db:evidence con el dominio.
-- @consulta boletos
-- espera: 12 filas
SELECT t.folio, t.ordinal AS boleto, t.id AS identificador
FROM tickets t
ORDER BY t.folio, t.ordinal;

-- @consulta boletos_distintos
-- espera: 1 filas
SELECT COUNT(*) AS boletos, COUNT(DISTINCT id) AS identificadores_distintos FROM tickets;

-- Los ingresos de la taquilla: uno por boleto, como mucho, porque el boleto es la
-- clave primaria de admissions. La hora se muestra en la zona de la computadora de la
-- taquilla, escrita en la consulta: la de la sesión depende del cliente —psql en el
-- contenedor usa UTC—, y un ingreso a las 18:38 en Guadalajara es del día siguiente
-- en UTC. Si la taquilla está en otra zona, se cambia aquí y en
-- ingresos_fuera_de_fecha. La semilla no tiene ingresos.
-- @consulta ingresos
-- espera: 0 filas
SELECT t.folio, t.ordinal AS boleto, p.quantity AS de, p.venue_name AS recinto,
       p.event_date AS evento, a.admitted_at AT TIME ZONE 'America/Mexico_City' AS ingreso
FROM admissions a
JOIN tickets t ON t.id = a.ticket_id
JOIN purchases p ON p.folio = t.folio
ORDER BY a.admitted_at, t.folio, t.ordinal;

-- El WhatsApp de cada usuario, por la vista: sin el número. Abrir whatsapp_numbers
-- completa da 42501: el lector no tiene permiso sobre esa columna.
-- @consulta whatsapp_registrados
-- espera: 0 filas
SELECT user_id AS usuario, display_name AS nombre, registered AS registrado,
       verified AS verificado, consented_at AS consentimiento
FROM whatsapp_status
ORDER BY user_id;

-- Las fotos de perfil, por la vista: el formato y el peso, sin los bytes.
-- @consulta fotos_de_perfil
-- espera: 0 filas
SELECT user_id AS usuario, format AS formato, bytes, version, updated_at AS actualizada
FROM profile_photo_summary
ORDER BY user_id;


-- ══ Leer y escribir sin errores ═══════════════════════════════════════════

-- @consulta servidor
-- espera: 1 filas
SELECT version() AS servidor, current_user AS rol,
       current_setting('default_transaction_read_only') AS solo_lectura;

-- Cada restricción CHECK, con su definición: la base rechaza lo que la viola.
-- @consulta restricciones_check
-- espera: 53 filas
SELECT c.conrelid::regclass::text AS tabla, c.conname AS restriccion,
       pg_get_constraintdef(c.oid) AS definicion, c.convalidated AS validada
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype = 'c'
ORDER BY tabla, restriccion;

-- Cada clave foránea, con la tabla a la que apunta y qué hace al borrar.
-- @consulta claves_foraneas
-- espera: 19 filas
SELECT c.conrelid::regclass::text AS tabla, c.conname AS restriccion,
       c.confrelid::regclass::text AS referencia,
       CASE c.confdeltype WHEN 'c' THEN 'en cascada' WHEN 'a' THEN 'no se permite'
                          WHEN 'r' THEN 'restringido' ELSE c.confdeltype::text END AS al_borrar,
       c.convalidated AS validada
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype = 'f'
ORDER BY tabla, restriccion;

-- Los privilegios de los dos roles de la aplicación: el servidor no tiene DDL, y el
-- lector solo tiene SELECT. Se leen de pg_class y no de
-- information_schema.role_table_grants, que al lector solo le muestra los suyos.
-- @consulta privilegios
-- espera: 44 filas
SELECT r.rolname AS rol, c.relname AS tabla,
       string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type) AS privilegios
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND r.rolname IN ('palco_app', 'palco_lector')
GROUP BY r.rolname, c.relname
ORDER BY rol, tabla;

-- Las dos tablas que el lector lee por columna: sin e164 y sin data.
-- @consulta columnas_del_lector
-- espera: 7 filas
SELECT table_name AS tabla, column_name AS columna
FROM information_schema.column_privileges
WHERE grantee = 'palco_lector' AND table_name IN ('whatsapp_numbers', 'profile_photos')
ORDER BY tabla, columna;


-- ══ La disponibilidad después de una compra ═══════════════════════════════

-- Disponibles por recinto: aforo menos lo vendido, como lo calcula la aplicación en
-- cada lectura. Con NUXT_AVAILABILITY_OVERRIDES, la base del recinto es esa
-- sobrescritura y no el aforo.
-- @consulta disponibilidad
-- espera: 12 filas
SELECT v.id AS recinto, v.capacity AS aforo,
       COALESCE(SUM(p.quantity), 0) AS vendidos,
       v.capacity - COALESCE(SUM(p.quantity), 0) AS disponibles
FROM venues v LEFT JOIN purchases p ON p.venue_id = v.id
GROUP BY v.id
ORDER BY v.id;

-- Los bloqueos consultivos tomados ahora mismo: una compra en curso tiene el de su
-- recinto (espacio 1) y el del folio (2); un cambio de cuenta, el del usuario (3). Con
-- la base en reposo no hay ninguno. Corrida mientras otra sesión toma
-- `pg_advisory_lock(1, hashtext('teatro-scala'))`, muestra quién espera.
-- @consulta bloqueos_activos
SELECT l.pid AS proceso,
       CASE l.classid WHEN 1 THEN 'recinto' WHEN 2 THEN 'folio' WHEN 3 THEN 'usuario'
                      ELSE l.classid::text END AS bloqueo,
       l.objid AS clave, l.mode AS modo, l.granted AS concedido,
       CASE WHEN l.granted THEN 'lo tiene' ELSE 'espera' END AS estado
FROM pg_locks l
WHERE l.locktype = 'advisory' AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY l.classid, l.objid, l.granted DESC, l.pid;


-- ══ Consistencia en caso de error ═════════════════════════════════════════

-- Cada compra tiene tantos boletos como su cantidad.
-- @consulta compras_con_boletos_de_menos
-- espera: 0 filas
SELECT p.folio, p.quantity AS cantidad,
       (SELECT COUNT(*) FROM tickets t WHERE t.folio = p.folio) AS boletos
FROM purchases p
WHERE p.quantity <> (SELECT COUNT(*) FROM tickets t WHERE t.folio = p.folio);

-- Ningún boleto entró en otra fecha que la de su evento (RN-ACC-03). La fecha del
-- ingreso, en la zona de la taquilla, como en `ingresos`.
-- @consulta ingresos_fuera_de_fecha
-- espera: 0 filas
SELECT t.folio, t.ordinal AS boleto, p.event_date AS evento,
       (a.admitted_at AT TIME ZONE 'America/Mexico_City')::date AS fecha_del_ingreso
FROM admissions a
JOIN tickets t ON t.id = a.ticket_id
JOIN purchases p ON p.folio = t.folio
WHERE (a.admitted_at AT TIME ZONE 'America/Mexico_City')::date <> p.event_date;

-- Cada compra tiene exactamente una fila en payments, con su mismo monto.
-- @consulta pagos_inconsistentes
-- espera: 0 filas
SELECT p.folio,
       (SELECT COUNT(*) FROM payments y WHERE y.folio = p.folio) AS filas_en_payments,
       p.total_cents,
       (SELECT y.amount_cents FROM payments y WHERE y.folio = p.folio) AS amount_cents
FROM purchases p
WHERE (SELECT COUNT(*) FROM payments y WHERE y.folio = p.folio) <> 1
   OR (SELECT y.amount_cents FROM payments y WHERE y.folio = p.folio) <> p.total_cents;

-- Los boletos del historial de cada usuario suman lo mismo que sus compras.
-- @consulta historial_inconsistente
-- espera: 0 filas
SELECT u.id AS usuario,
       (SELECT COALESCE(SUM(h.quantity), 0) FROM purchase_history h WHERE h.user_id = u.id) AS en_historial,
       (SELECT COALESCE(SUM(p.quantity), 0) FROM purchases p WHERE p.user_id = u.id) AS en_compras
FROM users u
WHERE (SELECT COALESCE(SUM(h.quantity), 0) FROM purchase_history h WHERE h.user_id = u.id)
   <> (SELECT COALESCE(SUM(p.quantity), 0) FROM purchases p WHERE p.user_id = u.id);

-- Huérfanos: los tres deben ser cero.
-- @consulta huerfanos
-- espera: 1 filas
SELECT
  (SELECT COUNT(*) FROM tickets t WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.folio = t.folio)) AS boletos_sin_compra,
  (SELECT COUNT(*) FROM purchases p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id))   AS compras_sin_usuario,
  (SELECT COUNT(*) FROM purchases p WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v.id = p.venue_id)) AS compras_sin_recinto;

-- Restricciones sin validar. PostgreSQL no deja filas que violen una restricción
-- validada; esta consulta confirma que ninguna quedó como NOT VALID.
-- @consulta restricciones_sin_validar
-- espera: 0 filas
SELECT c.conrelid::regclass::text AS tabla, c.conname AS restriccion
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' AND c.contype IN ('c', 'f') AND NOT c.convalidated;


-- ══ Cantidad máxima de boletos por usuario ════════════════════════════════

-- Lo comprado por usuario, recinto y fecha del evento, contra el límite de su
-- categoría: 10 en teatro y cine, 5 en museo (RN-CAN-02 a 04, RN-CAN-07).
-- @consulta compras_por_usuario_y_fecha
-- espera: 5 filas
SELECT p.user_id AS usuario, p.venue_id AS recinto, to_char(p.event_date, 'YYYY-MM-DD') AS fecha,
       SUM(p.quantity) AS comprados,
       CASE p.category WHEN 'museo' THEN 5 ELSE 10 END AS limite,
       CASE p.category WHEN 'museo' THEN 5 ELSE 10 END - SUM(p.quantity) AS restante
FROM purchases p
GROUP BY p.user_id, p.venue_id, p.event_date, p.category
ORDER BY p.user_id, p.venue_id, p.event_date;

-- Ninguno pasa del límite.
-- @consulta excesos_del_limite
-- espera: 0 filas
SELECT p.user_id AS usuario, p.venue_id AS recinto, p.event_date AS fecha, SUM(p.quantity) AS comprados
FROM purchases p
GROUP BY p.user_id, p.venue_id, p.event_date, p.category
HAVING SUM(p.quantity) > CASE p.category WHEN 'museo' THEN 5 ELSE 10 END;


-- ══ El pago queda registrado como transacción ═════════════════════════════

-- Los pagos, desde la vista payments: una fila por compra, con el método, la marca
-- (NULL con PayPal), el monto y el estado. La vista no tiene el titular, el correo de
-- PayPal ni el número enmascarado; de purchases solo el recinto y la fecha.
-- @consulta pagos
-- espera: 5 filas
SELECT y.folio, y.user_id AS usuario, p.venue_name AS recinto,
       to_char(p.event_date, 'YYYY-MM-DD') || ' ' || to_char(p.event_time, 'HH24:MI') AS evento,
       y.method AS metodo, y.brand AS marca,
       y.currency || ' ' || to_char(y.amount_cents / 100.0, 'FM999,999,990.00') AS monto,
       y.status AS estado, y.paid_on AS pagado
FROM payments y JOIN purchases p ON p.folio = y.folio
ORDER BY p.sequence;

-- Sin datos sensibles del pago (RNF-15, RN-CON-05): ningún resumen lleva 13 o más
-- dígitos seguidos ni un código de seguridad.
-- @consulta resumenes_con_datos_sensibles
-- espera: 0 filas
SELECT folio
FROM purchases
WHERE payment_summary::text ~ '[0-9]{13,}'
   OR payment_summary::text ~* 'cvv|security';


-- ══ El monto total ════════════════════════════════════════════════════════

-- El desglose de cada compra: subtotal, cargo por servicio (solo en cine,
-- RN-TAR-05) y total, en la moneda del recinto.
-- @consulta desglose_del_total
-- espera: 5 filas
SELECT folio, category AS tipo, quantity AS cantidad,
       currency || ' ' || to_char(subtotal_cents / 100.0, 'FM999,999,990.00') AS subtotal,
       currency || ' ' || to_char(fee_cents / 100.0, 'FM999,999,990.00')      AS cargo,
       currency || ' ' || to_char(total_cents / 100.0, 'FM999,999,990.00')    AS total
FROM purchases
ORDER BY sequence;

-- Cada total es el subtotal más el cargo, el cargo es cero fuera del cine y el
-- método coincide con el resumen.
-- @consulta totales_inconsistentes
-- espera: 0 filas
SELECT folio FROM purchases
WHERE total_cents <> subtotal_cents + fee_cents
   OR (fee_cents <> 0 AND category <> 'cine')
   OR payment_method <> payment_summary->>'method';
