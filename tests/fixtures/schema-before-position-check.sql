-- The PALCO schema as it was before venues.position had its CHECK constraint.
-- PU9g (tests/venues-repository.test.ts) applies it, then applies the current
-- schema twice, to prove the constraint reaches an older database exactly once.
-- Comments removed; statements unchanged.


CREATE TABLE IF NOT EXISTS users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  email         TEXT,
  created_at    TIMESTAMPTZ(0) NOT NULL DEFAULT now(),
  CHECK (length(username) = 20),
  CHECK (length(display_name) BETWEEN 1 AND 60)
);

CREATE TABLE IF NOT EXISTS profile_photos (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  format     TEXT    NOT NULL CHECK (format IN ('jpeg', 'png', 'webp')),
  data       BYTEA   NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 2097152),
  version    TEXT    NOT NULL,
  updated_at TIMESTAMPTZ(0) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  position INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id       TEXT    NOT NULL UNIQUE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method   TEXT    NOT NULL CHECK (method IN ('debit', 'credit', 'paypal')),
  brand    TEXT,
  last4    TEXT,
  holder   TEXT,
  expiry   TEXT,
  email    TEXT,
  CHECK (
    (method = 'paypal' AND email IS NOT NULL
      AND brand IS NULL AND last4 IS NULL AND holder IS NULL AND expiry IS NULL)
    OR
    (method <> 'paypal' AND email IS NULL
      AND brand IN ('visa', 'mastercard') AND last4 ~ '^[0-9]{4}$'
      AND holder IS NOT NULL AND expiry IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

CREATE TABLE IF NOT EXISTS payment_method_additions (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_on DATE    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_method_additions_user
  ON payment_method_additions(user_id, added_on);

CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  e164         TEXT    NOT NULL CHECK (e164 ~ '^\+[1-9][0-9]{1,14}$'),
  verified     BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMPTZ(0) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venues (
  id           TEXT    PRIMARY KEY,
  category     TEXT    NOT NULL CHECK (category IN ('teatro', 'cine', 'museo')),
  name         TEXT    NOT NULL,
  city         TEXT    NOT NULL,
  jurisdiction TEXT    NOT NULL CHECK (jurisdiction IN ('AR', 'IT', 'VA', 'MX', 'FR', 'US', 'ES')),
  currency     TEXT    NOT NULL CHECK (currency IN ('ARS', 'EUR', 'MXN', 'USD')),
  capacity     INTEGER NOT NULL CHECK (capacity > 0),
  opens        TIME    NOT NULL,
  closes       TIME    NOT NULL,
  restrictions TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  sequence        INTEGER PRIMARY KEY CHECK (sequence >= 1),
  folio           TEXT    NOT NULL UNIQUE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id        TEXT    NOT NULL REFERENCES venues(id),
  request_id      TEXT    NOT NULL,
  fingerprint     TEXT    NOT NULL,
  category        TEXT    NOT NULL CHECK (category IN ('teatro', 'cine', 'museo')),
  venue_name      TEXT    NOT NULL,
  city            TEXT    NOT NULL,
  restrictions    TEXT    NOT NULL,
  event_date      DATE    NOT NULL,
  event_time      TIME    NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  subtotal_cents  INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  fee_cents       INTEGER NOT NULL CHECK (fee_cents >= 0),
  total_cents     INTEGER NOT NULL CHECK (total_cents = subtotal_cents + fee_cents),
  currency        TEXT    NOT NULL CHECK (currency IN ('ARS', 'EUR', 'MXN', 'USD')),
  payment_method  TEXT    NOT NULL CHECK (payment_method IN ('debit', 'credit', 'paypal')),
  payment_summary JSONB   NOT NULL CHECK (jsonb_typeof(payment_summary) = 'object' AND payment_summary->>'method' = payment_method),
  details         JSONB   NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  status          TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed')),
  purchased_on    DATE    NOT NULL,
  created_at      TIMESTAMPTZ(0) NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id),
  CHECK (fee_cents = 0 OR category = 'cine')
);

CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_venue ON purchases(venue_id) INCLUDE (quantity);
CREATE INDEX IF NOT EXISTS idx_purchases_user_venue_date ON purchases(user_id, venue_id, event_date) INCLUDE (quantity);

CREATE TABLE IF NOT EXISTS tickets (
  id      TEXT    PRIMARY KEY CHECK (length(id) = 16),
  folio   TEXT    NOT NULL REFERENCES purchases(folio) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  UNIQUE (folio, ordinal)
);

CREATE UNIQUE INDEX IF NOT EXISTS venues_id_category_key ON venues (id, category);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS position SMALLINT;
CREATE UNIQUE INDEX IF NOT EXISTS venues_position_key ON venues (position);

CREATE TABLE IF NOT EXISTS venue_hours (
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('alternate', 'sunday_holiday')),
  opens    TIME NOT NULL,
  closes   TIME NOT NULL,
  CHECK (opens < closes),
  PRIMARY KEY (venue_id, kind)
);

CREATE TABLE IF NOT EXISTS venue_closed_weekdays (
  venue_id TEXT     NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  weekday  SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (venue_id, weekday)
);

CREATE TABLE IF NOT EXISTS venue_exceptions (
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  policy   TEXT NOT NULL CHECK (policy IN ('CLOSES_ON_HOLIDAY', 'OPENS_ON_HOLIDAY', 'OPENS_LAST_SUNDAY',
    'SEASONAL_HOURS', 'WEEKEND_HOURS', 'NIGHT_HOURS', 'SUNDAY_HOLIDAY_HOURS')),
  PRIMARY KEY (venue_id, policy)
);

CREATE TABLE IF NOT EXISTS venue_annual_closures (
  venue_id TEXT     NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  month    SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  day      SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
  name     TEXT     NOT NULL,
  PRIMARY KEY (venue_id, month, day)
);

CREATE TABLE IF NOT EXISTS venue_theaters (
  venue_id TEXT NOT NULL PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'teatro' CHECK (category = 'teatro'),
  attire   TEXT NOT NULL,
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_sections (
  venue_id    TEXT     NOT NULL,
  category    TEXT     NOT NULL DEFAULT 'teatro' CHECK (category = 'teatro'),
  position    SMALLINT NOT NULL CHECK (position >= 0),
  name        TEXT     NOT NULL,
  price_cents INTEGER  NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (venue_id, position),
  UNIQUE (venue_id, name),
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_plays (
  venue_id TEXT     NOT NULL,
  category TEXT     NOT NULL DEFAULT 'teatro' CHECK (category = 'teatro'),
  position SMALLINT NOT NULL CHECK (position >= 0),
  title    TEXT     NOT NULL,
  PRIMARY KEY (venue_id, position),
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_cinemas (
  venue_id          TEXT    NOT NULL PRIMARY KEY,
  category          TEXT    NOT NULL DEFAULT 'cine' CHECK (category = 'cine'),
  service_fee_cents INTEGER NOT NULL CHECK (service_fee_cents >= 0),
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_formats (
  venue_id    TEXT     NOT NULL,
  category    TEXT     NOT NULL DEFAULT 'cine' CHECK (category = 'cine'),
  position    SMALLINT NOT NULL CHECK (position >= 0),
  format_id   TEXT     NOT NULL CHECK (format_id IN ('tradicional', 'pluus', 'vip', 'macro-xe', 'junior', '4dx',
    'x4d', 'platino', 'premium', 'cinemextremo', 'cinema', 'imax', 'xd', 'd-box', 'screenx', 'dolby', 'prime', 'vr')),
  price_cents INTEGER  NOT NULL CHECK (price_cents >= 0),
  seats       INTEGER  NOT NULL CHECK (seats > 0),
  PRIMARY KEY (venue_id, position),
  UNIQUE (venue_id, format_id),
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_films (
  venue_id         TEXT     NOT NULL,
  category         TEXT     NOT NULL DEFAULT 'cine' CHECK (category = 'cine'),
  position         SMALLINT NOT NULL CHECK (position >= 0),
  title            TEXT     NOT NULL,
  classification   TEXT     NOT NULL CHECK (classification IN ('AA', 'A', 'B', 'B15', 'C', 'D', 'G', 'PG', 'PG-13', 'R', 'NC-17')),
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes > 0),
  PRIMARY KEY (venue_id, position),
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS venue_museums (
  venue_id           TEXT    NOT NULL PRIMARY KEY,
  category           TEXT    NOT NULL DEFAULT 'museo' CHECK (category = 'museo'),
  general_fee_cents  INTEGER NOT NULL CHECK (general_fee_cents >= 0),
  resident_fee_cents INTEGER CHECK (resident_fee_cents >= 0),
  residency_question TEXT,
  entry_note         TEXT    NOT NULL,
  CHECK ((resident_fee_cents IS NULL) = (residency_question IS NULL)),
  FOREIGN KEY (venue_id, category) REFERENCES venues (id, category) ON DELETE CASCADE
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'venue_prices' AND c.relkind = 'r') THEN
    DROP TABLE venue_prices;
  END IF;
END $$;

CREATE OR REPLACE VIEW venue_prices AS
SELECT venue_id, 'section'::text AS kind, name AS label, price_cents FROM venue_sections
UNION ALL
SELECT venue_id, 'format', format_id, price_cents FROM venue_formats
UNION ALL
SELECT venue_id, 'service_fee', 'service_fee', service_fee_cents FROM venue_cinemas
UNION ALL
SELECT venue_id, 'general', 'general', general_fee_cents FROM venue_museums
UNION ALL
SELECT venue_id, 'resident', 'resident', resident_fee_cents FROM venue_museums WHERE resident_fee_cents IS NOT NULL;

CREATE OR REPLACE VIEW payments AS
SELECT folio,
       user_id,
       payment_method             AS method,
       payment_summary->>'brand'  AS brand,
       total_cents                AS amount_cents,
       currency,
       status,
       purchased_on               AS paid_on
FROM purchases;

CREATE OR REPLACE VIEW purchase_history AS
SELECT u.id AS user_id,
       u.display_name,
       p.folio,
       p.category,
       p.venue_name,
       p.city,
       p.event_date,
       p.event_time,
       p.quantity,
       p.total_cents,
       p.currency,
       p.status,
       p.purchased_on
FROM users u
JOIN purchases p ON p.user_id = u.id;

CREATE OR REPLACE VIEW whatsapp_status AS
SELECT w.user_id,
       u.display_name,
       true AS registered,
       w.verified,
       w.consented_at
FROM whatsapp_numbers w
JOIN users u ON u.id = w.user_id;

CREATE OR REPLACE VIEW profile_photo_summary AS
SELECT user_id,
       format,
       octet_length(data) AS bytes,
       version,
       updated_at
FROM profile_photos;

GRANT USAGE ON SCHEMA public TO palco_app, palco_lector;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM palco_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM palco_app;
GRANT SELECT, INSERT ON users, purchases, tickets TO palco_app;
GRANT SELECT, INSERT, DELETE ON payment_method_additions TO palco_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_photos, payment_methods, whatsapp_numbers TO palco_app;
GRANT SELECT ON venues, venue_prices, venue_hours, venue_closed_weekdays, venue_exceptions,
  venue_annual_closures, venue_theaters, venue_sections, venue_plays, venue_cinemas,
  venue_formats, venue_films, venue_museums TO palco_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM palco_lector;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM palco_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO palco_lector;
REVOKE ALL ON whatsapp_numbers, profile_photos FROM palco_lector;
GRANT SELECT (user_id, verified, consented_at) ON whatsapp_numbers TO palco_lector;
GRANT SELECT (user_id, format, version, updated_at) ON profile_photos TO palco_lector;
