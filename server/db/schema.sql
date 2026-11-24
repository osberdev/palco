-- The PALCO schema for PostgreSQL. It is idempotent and applied by its owner,
-- `palco_admin`, with `bun run db:init`: the server connects as `palco_app`,
-- which has no DDL. The roles are created elsewhere (01-roles.sh).
-- One column per line: SC1 reads this file as text.
-- Timestamps have no fractional seconds: nothing uses them, and a few
-- microseconds could by chance contain a value that PU7 and INT3 search for to
-- prove it is absent.

-- `email` allows NULL: it is optional at registration (RN-REG-06), and a filler
-- value would be false data. When present it is stored in lowercase. The name
-- CHECK repeats RN-PER-09: `length()` counts code points, like `nameLength`.
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

-- Profile photo. A separate table keyed by user: db:reset deletes it with the
-- users and no loose files are left behind. The CHECKs repeat RN-PER-06 as
-- defense in depth, like the one on users.
-- `version` is a random token, not a counter: deleting and uploading again
-- would reset a counter and the cache would serve the previous photo.
CREATE TABLE IF NOT EXISTS profile_photos (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  format     TEXT    NOT NULL CHECK (format IN ('jpeg', 'png', 'webp')),
  data       BYTEA   NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 2097152),
  version    TEXT    NOT NULL,
  updated_at TIMESTAMPTZ(0) NOT NULL DEFAULT now()
);

-- Saved payment methods (RN-MET-04). Never the full number or the security
-- code: there is no column for them (SC1 guards this). `id` is a server UUID
-- and `position` only gives the order, most recent first (RN-MET-03); it never
-- leaves the server. The CHECK repeats which columns each method carries, as
-- defense in depth.
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

-- Payment method additions per day (RN-MET-10). In a table of their own rather
-- than counting payment_methods rows: removing a method deletes its row, so
-- adding and removing in a loop would never reach the limit. Only today's rows
-- are kept; an insert deletes the user's earlier ones.
CREATE TABLE IF NOT EXISTS payment_method_additions (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_on DATE    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_method_additions_user
  ON payment_method_additions(user_id, added_on);

-- The user's WhatsApp number (RN-WSP-01 to 04). One per user, in E.164 and
-- without the country, which comes from the number itself. `verified` is always
-- false while verification is reserved: the column exists so that verifying
-- later does not require a migration.
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  e164         TEXT    NOT NULL CHECK (e164 ~ '^\+[1-9][0-9]{1,14}$'),
  verified     BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMPTZ(0) NOT NULL DEFAULT now()
);

-- Venues. The database is the source of the venues: the server reads them at
-- startup, validates them with `parseVenueRows` and freezes them.
-- `server/data/catalog.ts` is the seed: `db:init` and `db:seed` write it as
-- `palco_admin`, the only role that writes here.
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

-- Confirmed purchases. The columns hold what the three categories share, and
-- `details`, in JSON, only what is specific to each one. Name, city and
-- restrictions are copied from the venue: the purchase records what was sold,
-- even if the catalog changes later. Never the full number or the security
-- code: `payment_summary` is the PaymentSummary of RN-CON-05, and no column is
-- named number, card, cvv, code or security (SC1, PU7). `sequence` is the folio
-- counter, deliberately not an identity: it must not go backwards, and a
-- failure must not consume a folio. `jsonb` does not preserve key order:
-- `toPurchase` rebuilds it (PU1).
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
-- `INCLUDE (quantity)`: sold and purchased totals are summed from the index alone.
CREATE INDEX IF NOT EXISTS idx_purchases_venue ON purchases(venue_id) INCLUDE (quantity);
-- The ticket limit per user, venue and date (RN-CAN-07).
CREATE INDEX IF NOT EXISTS idx_purchases_user_venue_date ON purchases(user_id, venue_id, event_date) INCLUDE (quantity);

-- Tickets: the 16-character Crockford id (RN-BOL-01) and its place in the
-- purchase, "Boleto N de M". It is called `ordinal`, not `number`: no column
-- has number in its name, so SC1 and PU7 can single out a card number. The
-- signature is not stored: it is computed with the running key on request.
CREATE TABLE IF NOT EXISTS tickets (
  id      TEXT    PRIMARY KEY CHECK (length(id) = 16),
  folio   TEXT    NOT NULL REFERENCES purchases(folio) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
  UNIQUE (folio, ordinal)
);

-- Admissions (RN-ACC-04): one per ticket. The primary key is the ticket: a
-- second admission collides with it, and `INSERT … ON CONFLICT DO NOTHING` lets
-- the database settle it without an advisory lock, even when two scans arrive at
-- once. The venue is not stored: a ticket only enters at its own venue's gate
-- (RN-ACC-03), so it would be a copy of purchases.venue_id. The server sets the
-- time instead of now(): the admission date and time come from the same clock
-- that decided to admit it, and the frozen clock in the tests reaches it. No
-- UPDATE or DELETE for palco_app: an admission is never corrected or voided.
CREATE TABLE IF NOT EXISTS admissions (
  ticket_id   TEXT           PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  admitted_at TIMESTAMPTZ(0) NOT NULL
);

-- ── Complete venues ─────────────────────────────────────────────────────────
-- Each category's own columns live in a table per category rather than in
-- `venues`: adding them to an existing table with a CHECK per category would fail
-- on an older database, whose rows do not have that data yet, or would leave the
-- CHECK unvalidated. Each child table has a fixed category and a composite
-- foreign key to `venues (id, category)`: a section cannot be written for a cinema.
CREATE UNIQUE INDEX IF NOT EXISTS venues_id_category_key ON venues (id, category);

-- The catalog order, from 0 to n−1: the order of `GET /api/catalog`. Added with
-- ALTER because `venues` already exists in older databases; `parseVenueRows`
-- validates that there are no gaps. A NULL `position` is a venue withdrawn from
-- the catalog: kept for its purchases, not loaded by the server and not sold
-- (`syncVenues`).
ALTER TABLE venues ADD COLUMN IF NOT EXISTS position SMALLINT;
CREATE UNIQUE INDEX IF NOT EXISTS venues_position_key ON venues (position);

-- The CHECK is separate and named: an older database may already have the
-- column, and `ADD COLUMN IF NOT EXISTS` would not add it. Created only if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_position_check'
                 AND conrelid = 'public.venues'::regclass) THEN
    ALTER TABLE venues ADD CONSTRAINT venues_position_check CHECK (position IS NULL OR position >= 0);
  END IF;
END $$;

-- The general `hours` stay in venues.opens and venues.closes. The other two
-- schedules, at most one of each kind per venue.
CREATE TABLE IF NOT EXISTS venue_hours (
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('alternate', 'sunday_holiday')),
  opens    TIME NOT NULL,
  closes   TIME NOT NULL,
  CHECK (opens < closes),
  PRIMARY KEY (venue_id, kind)
);

-- 0 = Sunday, like `dayOfWeek`.
CREATE TABLE IF NOT EXISTS venue_closed_weekdays (
  venue_id TEXT     NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  weekday  SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (venue_id, weekday)
);

-- A set: the order means nothing. Read with `policy COLLATE "C"` so PGlite and
-- the container sort the same way.
CREATE TABLE IF NOT EXISTS venue_exceptions (
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  policy   TEXT NOT NULL CHECK (policy IN ('CLOSES_ON_HOLIDAY', 'OPENS_ON_HOLIDAY', 'OPENS_LAST_SUNDAY',
    'SEASONAL_HOURS', 'WEEKEND_HOURS', 'NIGHT_HOURS', 'SUNDAY_HOLIDAY_HOURS')),
  PRIMARY KEY (venue_id, policy)
);

-- `parseVenueRows` validates that the date exists (30/2 does not, 29/2 does).
CREATE TABLE IF NOT EXISTS venue_annual_closures (
  venue_id TEXT     NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  month    SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  day      SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
  name     TEXT     NOT NULL,
  PRIMARY KEY (venue_id, month, day)
);

-- Theater. `attire` rather than `dress_code`: no column contains "code" (SC1, PU7b).
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

-- Cinema.
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

-- Museum. Without a differentiated fee, the resident fee and the question are
-- NULL, and `hasDifferentiatedFee` is `resident_fee_cents IS NOT NULL`:
-- `parseVenueRows` rebuilds `residentFee = generalFee`.
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

-- `venue_prices` turns from a table into a view: the same four fields and the
-- same rows, built from their sources, without a second copy of the prices. In an
-- older database it is a table that only held a projection of the catalog, so it
-- can be dropped: `db:init` refills everything from the new tables. The
-- conversion is idempotent: it only drops while it is still a table.
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

-- Payments and purchase history are views, not tables. Each purchase has exactly
-- one payment, recorded in the same transaction, so a table would duplicate data
-- and open a second source of truth. A view exposes only the columns it chooses:
-- from the payment summary, the brand, never the holder, the PayPal email or the
-- masked number; from the user, the name, never the hash, the CURP, the email or
-- the WhatsApp number. No column is named after forbidden data (SC1, PU7b, VW2).
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

-- A user without purchases does not appear: their history is empty.
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

-- The two tables `palco_lector` cannot read in full, exposed so they can be
-- opened in a database client. A view runs with its owner's privileges: the
-- reader reads through it what it cannot read from the column.
-- `whatsapp_status` has no number, `e164`: it only says whether there is one
-- (`registered`, always true for an existing row), whether it is verified and
-- since when consent was given. `profile_photo_summary` has no bytes, `data`:
-- only their format and size. VW5 checks that no view column exposes them. They
-- come before the privileges block: the reader's `GRANT SELECT ON ALL TABLES`
-- only reaches objects that already exist.
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

-- Privileges. `palco_app` has only what the server uses, table by table; it has
-- no DDL, and only `palco_admin` writes the venues. A purchase is never edited
-- or deleted, and neither is a user. A future cancellation or refund would have
-- to grant the privilege it needs, column by column. ON DELETE CASCADE does not
-- need it: the cascade runs as the table owner.
-- The REVOKE comes first because re-applying a GRANT does not remove what was
-- granted before: this way `db:init` also narrows the privileges of an older
-- database.
-- No privileges on sequences: they all belong to identity columns, and
-- PostgreSQL does not check `USAGE` when an INSERT generates their value. PRV1
-- checks their absence, and the REVOKE removes it from older databases that had it.
-- `palco_lector` reads everything except the WhatsApp number and the photo bytes,
-- and writes nothing. Its general REVOKE also comes first, for the same reason
-- as `palco_app`'s; the general GRANT is narrowed again right after.
GRANT USAGE ON SCHEMA public TO palco_app, palco_lector;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM palco_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM palco_app;
GRANT SELECT, INSERT ON users, purchases, tickets, admissions TO palco_app;
GRANT SELECT, INSERT, DELETE ON payment_method_additions TO palco_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON profile_photos, payment_methods, whatsapp_numbers TO palco_app;
-- The venues, read-only: only `palco_admin` writes them. `venue_prices` is a
-- view, and it is named here even though the server does not read it: older
-- databases had SELECT on the table, and PRV1 checks that it is kept.
GRANT SELECT ON venues, venue_prices, venue_hours, venue_closed_weekdays, venue_exceptions,
  venue_annual_closures, venue_theaters, venue_sections, venue_plays, venue_cinemas,
  venue_formats, venue_films, venue_museums TO palco_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM palco_lector;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM palco_lector;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO palco_lector;
REVOKE ALL ON whatsapp_numbers, profile_photos FROM palco_lector;
GRANT SELECT (user_id, verified, consented_at) ON whatsapp_numbers TO palco_lector;
GRANT SELECT (user_id, format, version, updated_at) ON profile_photos TO palco_lector;
