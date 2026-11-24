import type { PaymentSummary } from '../server/domain/payment'
import type { MuseumFeeKind } from '../server/domain/purchase'
import type { ResultCode } from '../server/domain/result'
import type { WhatsappField } from '../server/domain/whatsapp'

/** The user as it travels to the UI. Never includes the hash. */
export interface SessionUser {
  readonly id: number
  readonly username: string
  readonly displayName: string
  /** Token of the saved photo, or null without a photo. It changes with every new photo. */
  readonly photoVersion: string | null
}

export interface LoginSuccess {
  readonly ok: true
  readonly user: SessionUser
}

export interface LoginFailure {
  readonly ok: false
  readonly code: ResultCode
  readonly message: string
}

export type LoginResponse = LoginSuccess | LoginFailure

/** Registration fields, in form order. */
export type RegistrationField = 'username' | 'displayName' | 'email' | 'password' | 'passwordConfirmation'

/**
 * Response of `POST /api/auth/register`: success has the login's shape; a
 * rejection carries its field, or null if it is not about a field (the body shape,
 * an already registered CURP).
 */
export type RegisterResponse =
  | LoginSuccess
  | {
    readonly ok: false
    readonly field: RegistrationField | null
    readonly code: ResultCode
    readonly message: string
  }

export interface SessionResponse {
  readonly user: SessionUser | null
}

/** Response of `PUT` and `DELETE /api/profile/photo`. */
export interface ProfilePhotoSuccess {
  readonly ok: true
  readonly user: SessionUser
}

/** A photo rejection, with the login's shape. */
export interface ProfilePhotoFailure {
  readonly ok: false
  readonly code: ResultCode
  readonly message: string
}

export type ProfilePhotoResponse = ProfilePhotoSuccess | ProfilePhotoFailure

/** The user's WhatsApp number, masked only: the full one never leaves the server. */
export interface WhatsappView {
  readonly masked: string
}

export interface WhatsappStatus {
  readonly whatsapp: WhatsappView | null
}

export interface WhatsappSaveSuccess {
  readonly ok: true
  readonly whatsapp: WhatsappView
}

export interface WhatsappSaveFailure {
  readonly ok: false
  readonly field: WhatsappField | null
  readonly code: ResultCode
  readonly message: string
}

export type WhatsappSaveResponse = WhatsappSaveSuccess | WhatsappSaveFailure

/** A purchase's WhatsApp send status. Without the E.164 number. */
export interface WhatsappSendStatus {
  /** The server has the Meta configuration (RF-ENV-09). */
  readonly available: boolean
  readonly registered: boolean
  readonly masked: string | null
  readonly state: 'idle' | 'sending' | 'sent' | 'failed'
  readonly failure: {
    readonly code: ResultCode
    readonly metaCode: number | null
    readonly offline: boolean
    /** ISO 8601. */
    readonly at: string
  } | null
  /** ISO 8601. */
  readonly sentAt: string | null
  /** Sends left in the hour (RN-ENV-04). */
  readonly remaining: number
  readonly retryAfterSeconds: number | null
}

export interface WhatsappSendRejection {
  readonly ok: false
  readonly code: ResultCode
  readonly message: string
}

export type CategorySlug = 'teatro' | 'cine' | 'museo'

/** 0 = Sunday, Sakamoto's convention. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface CalendarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

export interface TimeOfDay {
  readonly hour: number
  readonly minute: number
}

/** A closed interval at both ends (RN-APE-08). */
export interface OpeningHours {
  readonly open: TimeOfDay
  readonly close: TimeOfDay
}

/** A fixed date that repeats every year: only day and month. */
export interface AnnualClosure {
  readonly day: number
  readonly month: number
  readonly name: string
}

/**
 * A holiday calendar, not a political country: the Vatican is separate from Italy
 * because its calendar differs.
 */
export type Jurisdiction = 'AR' | 'IT' | 'VA' | 'MX' | 'FR' | 'US' | 'ES'

export type Currency = 'ARS' | 'EUR' | 'MXN' | 'USD'

/**
 * An amount in the currency's minor unit (cents), a safe non-negative integer. The
 * brand prevents passing an arbitrary `number` where an amount goes: only
 * `server/domain/money.ts` applies it.
 */
export type Cents = number & { readonly __unit: 'cents' }

/**
 * A list rather than an exclusive enumeration: the MNAC combines three at once. A
 * new exception extends the union without changing the venue shape.
 */
export type ExceptionPolicy =
  | 'CLOSES_ON_HOLIDAY'
  | 'OPENS_ON_HOLIDAY'
  | 'OPENS_LAST_SUNDAY'
  | 'SEASONAL_HOURS'
  | 'WEEKEND_HOURS'
  | 'NIGHT_HOURS'
  | 'SUNDAY_HOLIDAY_HOURS'

/** The core shared by the three venue types. */
export interface VenueBase {
  readonly id: string
  readonly name: string
  readonly city: string
  readonly category: CategorySlug
  readonly capacity: number
  readonly jurisdiction: Jurisdiction
  readonly currency: Currency
  readonly hours: OpeningHours
  /** Season, weekend or night, depending on the policy that enables it. */
  readonly alternateHours: OpeningHours
  /** Sundays and holidays, reduced. */
  readonly sundayHours: OpeningHours
  readonly closedWeekdays: readonly Weekday[]
  readonly exceptions: readonly ExceptionPolicy[]
  readonly annualClosures: readonly AnnualClosure[]
  /** Shown on confirmation (RF-CON-04). */
  readonly restrictions: string
}

/** Price in cents of the venue's currency. */
export interface TheaterSection {
  readonly name: string
  readonly price: Cents
}

/**
 * The cinema formats. 'vr' exists even though no chain operates it: it is the
 * guaranteed rejection case for all four chains.
 */
export type CinemaFormatId =
  | 'tradicional'
  | 'pluus'
  | 'vip'
  | 'macro-xe'
  | 'junior'
  | '4dx'
  | 'x4d'
  | 'platino'
  | 'premium'
  | 'cinemextremo'
  | 'cinema'
  | 'imax'
  | 'xd'
  | 'd-box'
  | 'screenx'
  | 'dolby'
  | 'prime'
  | 'vr'

/**
 * Price in cents, without the service fee: that fee belongs to the purchase
 * (RN-TAR-05).
 */
export interface CinemaFormat {
  readonly id: CinemaFormatId
  readonly price: Cents
  readonly seats: number
}

/** Classifications: Mexico's RTC and the US MPA. */
export type FilmClassification =
  | 'AA' | 'A' | 'B' | 'B15' | 'C' | 'D'
  | 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17'

export interface CinemaFilm {
  readonly title: string
  readonly classification: FilmClassification
  readonly durationMinutes: number
}

export interface TheaterVenue extends VenueBase {
  readonly category: 'teatro'
  readonly sections: readonly TheaterSection[]
  /** The listings, at most 3 plays. */
  readonly plays: readonly string[]
  /** Shown on confirmation (RF-CON-05). */
  readonly dressCode: string
}

export interface CinemaVenue extends VenueBase {
  readonly category: 'cine'
  /** Fee per ticket, in cents. */
  readonly serviceFee: Cents
  readonly formats: readonly CinemaFormat[]
  /** The listings, at most 5 films. */
  readonly films: readonly CinemaFilm[]
}

export interface MuseumVenue extends VenueBase {
  readonly category: 'museo'
  /** Fees in cents. */
  readonly generalFee: Cents
  /** Equal to `generalFee` when there is no differentiated fee. */
  readonly residentFee: Cents
  readonly hasDifferentiatedFee: boolean
  /**
   * The residency question, or null without a differentiated fee (RN-TAR-02 and 03).
   * Each museum asks its own question.
   */
  readonly residencyQuestion: string | null
  /** Without a trailing period; shown on confirmation (RF-CON-06). */
  readonly entryNote: string
}

/**
 * A discriminated union rather than a single type: with a single one, eight of the
 * twelve venues would have permanently empty fields.
 */
export type Venue = TheaterVenue | CinemaVenue | MuseumVenue

export interface Category {
  readonly slug: CategorySlug
  readonly name: string
  /** Count label: cinemas are chains, not venues. */
  readonly countLabel: string
  readonly maxTickets: number
}

/**
 * A venue as it travels to the catalog screen. Without hours, exceptions or
 * closures: the screen does not use them and they would travel to the client for
 * nothing.
 */
export interface CatalogVenue {
  readonly id: string
  readonly name: string
  readonly city: string
  readonly category: CategorySlug
  readonly currency: Currency
  readonly capacity: number
  readonly available: number
  /** The venue's lowest price, in cents, labeled "Desde". */
  readonly referencePrice: Cents
  /** Sections for theaters, formats for cinemas, null for museums. */
  readonly detailCount: number | null
  /** False outside museums. */
  readonly hasResidentFee: boolean
}

export interface CatalogResponse {
  readonly categories: readonly Category[]
  readonly venues: readonly CatalogVenue[]
}

/**
 * A theater's purchase detail (GET /api/venues/:id). Unlike `CatalogVenue`, it
 * carries the complete venue with hours and exceptions: the purchase screen
 * evaluates the opening on the client with the domain.
 *
 * `category` is at the top level because TypeScript does not narrow the parent
 * object by a nested property.
 */
export interface TheaterDetail {
  readonly category: 'teatro'
  readonly venue: TheaterVenue
  readonly available: number
  readonly userLimit: number
}

/** A cinema's purchase detail, with the same rationale as `TheaterDetail`. */
export interface CinemaDetail {
  readonly category: 'cine'
  readonly venue: CinemaVenue
  readonly available: number
  readonly userLimit: number
}

/** A museum's purchase detail, with the same rationale as `TheaterDetail`. */
export interface MuseumDetail {
  readonly category: 'museo'
  readonly venue: MuseumVenue
  readonly available: number
  readonly userLimit: number
}

export type VenueDetail = TheaterDetail | CinemaDetail | MuseumDetail

/** Payment method, in menu order. */
export type PaymentMethod = 'debit' | 'credit' | 'paypal'

/** Brands the system accepts (RN-PAG-05). */
export type CardBrand = 'visa' | 'mastercard'

// ── Saved payment methods ─────────────────────────────────────────────────

/**
 * What is stored of a card (RN-MET-04): never the full number or the security
 * code, which do not exist as fields.
 */
export interface SavedCardData {
  readonly method: 'debit' | 'credit'
  readonly brand: CardBrand
  readonly last4: string
  readonly holder: string
  readonly expiry: string
}

export interface SavedPaypalData {
  readonly method: 'paypal'
  readonly email: string
}

/** A saved method before it gets its `id`. */
export type SavedPaymentMethodData = SavedCardData | SavedPaypalData

/**
 * A saved method as it travels to the UI. The `id` is a random server UUID: it
 * neither reveals how many methods exist nor lets anyone guess them.
 */
export type SavedPaymentMethod = SavedPaymentMethodData & { readonly id: string }

export interface PaymentMethodsResponse {
  readonly methods: readonly SavedPaymentMethod[]
}

/** The field of an addition or an edit; `null` when the whole request is rejected. */
export type SavedMethodField = 'method' | 'cardNumber' | 'holder' | 'expiry' | 'email'

export interface SavedMethodSuccess {
  readonly ok: true
  readonly method: SavedPaymentMethod
}

export interface SavedMethodFailure {
  readonly ok: false
  readonly field: SavedMethodField | null
  readonly code: ResultCode
  readonly message: string
}

/** Response of `POST` and `PATCH /api/payment-methods`. */
export type SavedMethodResponse = SavedMethodSuccess | SavedMethodFailure

/** A payment step summary row; each purchase builds it from its quote. */
export interface SummaryRow {
  readonly label: string
  readonly value: string
  /** Figures and dates in mono. */
  readonly mono?: boolean
}

// ── Recorded purchase ───────────────────────────────────────────────────────

/**
 * What the purchase summary shows, plus the folio. It does not store the
 * attendee's age, nor the user, who lives in the store and never travels to the
 * client.
 */
interface PurchaseBase {
  readonly folio: string
  readonly venueId: string
  readonly venueName: string
  readonly city: string
  readonly currency: Currency
  readonly date: CalendarDate
  readonly time: TimeOfDay
  readonly quantity: number
  /** Amounts in cents. */
  readonly amount: Cents
  /** Never the full number or the security code (RNF-15, RN-CON-05). */
  readonly payment: PaymentSummary
  /** RF-CON-04. */
  readonly restrictions: string
  /** The server's `today` at confirmation. */
  readonly purchasedOn: CalendarDate
}

export interface TheaterPurchase extends PurchaseBase {
  readonly category: 'teatro'
  readonly play: string
  readonly section: TheaterSection
  /** RF-CON-05. */
  readonly dressCode: string
}

export interface CinemaPurchase extends PurchaseBase {
  readonly category: 'cine'
  readonly film: CinemaFilm
  readonly formatId: CinemaFormatId
  /** The format price per ticket, without the fee: it is read, never divided. */
  readonly formatPrice: Cents
  readonly seats: readonly number[]
  readonly subtotal: Cents
  readonly serviceFee: Cents
  readonly feeTotal: Cents
}

export interface MuseumPurchase extends PurchaseBase {
  readonly category: 'museo'
  readonly feeKind: MuseumFeeKind
  readonly fee: Cents
  /** RF-CON-06. */
  readonly entryNote: string
}

export type Purchase = TheaterPurchase | CinemaPurchase | MuseumPurchase

/**
 * A purchase ticket as its owner sees it (RF-ENV-07): the short code and the
 * signed QR content. `seat` is the ticket's seat for cinemas and null for the
 * other two categories.
 */
export interface IssuedTicketView {
  readonly number: number
  readonly shortCode: string
  readonly qrPayload: string
  readonly seat: number | null
}

/**
 * The response of GET /api/purchases/:folio. The list carries no tickets: each QR
 * is a bearer credential.
 */
export type PurchaseDetail = Purchase & { readonly tickets: readonly IssuedTicketView[] }

export type PurchaseStep = 'tickets' | 'payment'

export interface PurchaseSuccess {
  readonly ok: true
  readonly folio: string
}

export interface PurchaseFailure {
  readonly ok: false
  /** Null for a body with no recognizable shape. */
  readonly step: PurchaseStep | null
  readonly field: string | null
  readonly seatIndex: number | null
  readonly code: ResultCode
  readonly message: string
}

export type PurchaseResponse = PurchaseSuccess | PurchaseFailure

export interface PurchasesResponse {
  readonly purchases: readonly Purchase[]
}

// The gate (RN-ACC-01 and 02)

/** A venue at the gate: only what the opening form and the top bar show. */
export interface GateVenue {
  readonly id: string
  readonly name: string
}

/** `GET /api/gate`: whether it is configured and, without an open gate, the venue list. */
export interface GateStatus {
  readonly configured: boolean
  readonly venue: GateVenue | null
  /** The loaded venues, in catalog order; empty without a configuration. */
  readonly venues: readonly GateVenue[]
}

export type GateOpenField = 'venueId' | 'pin'

export type GateOpenResponse =
  | { readonly ok: true, readonly venue: GateVenue }
  | {
    readonly ok: false
    readonly field: GateOpenField | null
    readonly code: ResultCode
    readonly message: string
  }

// Admission (RN-ACC-03 and 04)

/** What the gate shows about an admitted ticket: nothing personal and nothing about the payment. */
export interface AdmittedTicket {
  readonly shortCode: string
  readonly number: number
  readonly quantity: number
  readonly folio: string
  /** Section; format and seat; or fee, like the printed ticket. */
  readonly cells: readonly { readonly label: string, readonly value: string }[]
}

/** `POST /api/gate/admissions`. Times in ISO 8601: the screen shows them in local time. */
export type AdmissionResponse =
  | { readonly ok: true, readonly ticket: AdmittedTicket, readonly admittedAt: string }
  | {
    readonly ok: false
    readonly code: ResultCode
    readonly message: string
    /** The fact that explains the rejection: the venue, the date or the hours. */
    readonly detail: string | null
    /** The short code read, for "Últimas lecturas"; null without a shape or a signature. */
    readonly shortCode: string | null
    /** For an already used ticket, the time of its admission. */
    readonly admittedAt: string | null
  }
