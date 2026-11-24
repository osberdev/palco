import { describe, expect, it } from 'vitest'
import { parseDate, parseInteger, parseTime } from '../server/domain/input'
import type { Checked, ResultCode } from '../server/domain/result'

// Date and time are stricter than the legacy console implementation's parser: I5 is
// a case with trailing residue that it accepted. Each case carries its identifier
// in its name.

function outcome<T>(checked: Checked<T>): T | ResultCode {
  return checked.ok ? checked.value : checked.result.code
}

describe('parseDate — I1–I13', () => {
  it.each([
    ['I1', '25/12/2026', { year: 2026, month: 12, day: 25 }],
    ['I2', '1/1/2027', { year: 2027, month: 1, day: 1 }],
    ['I3', ' 25/12/2026 ', { year: 2026, month: 12, day: 25 }],
    ['I4', '25/12/26', 'ERR_DATE_FORMAT'],
    ['I5', '25/12/2026abc', 'ERR_DATE_FORMAT'],
    ['I6', '25 /12/2026', 'ERR_DATE_FORMAT'],
    ['I7', '+5/12/2026', 'ERR_DATE_FORMAT'],
    ['I8', '5-10-2026', 'ERR_DATE_FORMAT'],
    ['I9', '', 'ERR_DATE_FORMAT'],
    ['I10', '00/12/2026', 'ERR_DATE_INVALID'],
    ['I11', '31/02/2027', 'ERR_DATE_INVALID'],
    ['I12', '29/02/2028', { year: 2028, month: 2, day: 29 }],
    ['I13', '29/02/2100', 'ERR_DATE_INVALID'],
  ] as const)('%s %j', (_id, text, expected) => {
    expect(outcome(parseDate(text))).toEqual(expected)
  })
})

describe('parseTime — H1–H13', () => {
  it.each([
    ['H1', '19:30', { hour: 19, minute: 30 }],
    ['H2', '9:30', { hour: 9, minute: 30 }],
    ['H3', '09:05', { hour: 9, minute: 5 }],
    ['H4', ' 19:30 ', { hour: 19, minute: 30 }],
    ['H5', '9:5', 'ERR_TIME_FORMAT'],
    ['H6', '19:30h', 'ERR_TIME_FORMAT'],
    ['H7', 'abc', 'ERR_TIME_FORMAT'],
    ['H8', '', 'ERR_TIME_FORMAT'],
    ['H9', '24:00', 'ERR_TIME_OUT_OF_RANGE'],
    ['H10', '23:60', 'ERR_TIME_OUT_OF_RANGE'],
    ['H11', '99:99', 'ERR_TIME_OUT_OF_RANGE'],
    ['H12', '00:00', { hour: 0, minute: 0 }],
    ['H13', '23:59', { hour: 23, minute: 59 }],
  ] as const)('%s %j', (_id, text, expected) => {
    expect(outcome(parseTime(text))).toEqual(expected)
  })
})

describe('parseInteger — N1–N10', () => {
  it.each([
    ['N1', '3', 3],
    ['N2', ' 3 ', 3],
    ['N3', '+3', 3],
    ['N4', '-3', -3],
    ['N5', '0', 0],
    ['N6', '', 'ERR_INTEGER_EXPECTED'],
    ['N7', '2.5', 'ERR_INTEGER_EXPECTED'],
    ['N8', '3abc', 'ERR_INTEGER_EXPECTED'],
    ['N9', '1e3', 'ERR_INTEGER_EXPECTED'],
    ['N10', '9007199254740993', 'ERR_INTEGER_EXPECTED'],
  ] as const)('%s %j', (_id, text, expected) => {
    expect(outcome(parseInteger(text))).toEqual(expected)
  })
})
