import type { AnnualClosure, Jurisdiction } from '../../types'

/**
 * Fixed-date holidays per jurisdiction (movable holidays are not modeled). A
 * holiday does not close a venue by itself: it only does so for the venues that
 * declare `CLOSES_ON_HOLIDAY` (RN-APE-10).
 */
export const HOLIDAYS: Readonly<Record<Jurisdiction, readonly AnnualClosure[]>> = Object.freeze({
  AR: [
    { day: 1, month: 1, name: 'Año Nuevo' },
    { day: 1, month: 5, name: 'Día del Trabajador' },
    { day: 25, month: 5, name: 'Revolución de Mayo' },
    { day: 9, month: 7, name: 'Día de la Independencia' },
    { day: 25, month: 12, name: 'Navidad' },
  ],
  IT: [
    { day: 1, month: 1, name: 'Capodanno' },
    { day: 25, month: 4, name: 'Festa della Liberazione' },
    { day: 1, month: 5, name: 'Festa del Lavoro' },
    { day: 15, month: 8, name: 'Ferragosto' },
    { day: 25, month: 12, name: 'Natale' },
  ],
  VA: [
    { day: 1, month: 1, name: 'Solemnidad de María' },
    { day: 6, month: 1, name: 'Epifanía' },
    { day: 29, month: 6, name: 'San Pedro y San Pablo' },
    { day: 15, month: 8, name: 'Asunción' },
    { day: 25, month: 12, name: 'Navidad' },
    { day: 26, month: 12, name: 'San Esteban' },
  ],
  MX: [
    { day: 1, month: 1, name: 'Año Nuevo' },
    { day: 1, month: 5, name: 'Día del Trabajo' },
    { day: 16, month: 9, name: 'Independencia de México' },
    { day: 25, month: 12, name: 'Navidad' },
  ],
  FR: [
    { day: 1, month: 1, name: "Jour de l'An" },
    { day: 1, month: 5, name: 'Fête du Travail' },
    { day: 14, month: 7, name: 'Fête Nationale' },
    { day: 25, month: 12, name: 'Noël' },
  ],
  US: [
    { day: 1, month: 1, name: "New Year's Day" },
    { day: 4, month: 7, name: 'Independence Day' },
    { day: 25, month: 12, name: 'Christmas Day' },
  ],
  ES: [
    { day: 1, month: 1, name: 'Año Nuevo' },
    { day: 1, month: 5, name: 'Día del Trabajo' },
    { day: 11, month: 9, name: 'Diada de Catalunya' },
    { day: 25, month: 12, name: 'Navidad' },
  ],
})
