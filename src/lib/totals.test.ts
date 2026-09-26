import { describe, expect, it } from 'vitest'
import { computeTotals } from './totals'
import { money, timeParts, clock, abn } from './format'
import type { LineItem } from './types'

const item = (qty: number, unit_price: number): LineItem => ({ id: 'x', name: 'x', qty, unit_price, kind: 'service' })

describe('computeTotals', () => {
  it('adds 10% GST on the discounted subtotal', () => {
    const t = computeTotals([item(1, 100), item(2, 10)], 20, true)
    expect(t).toEqual({ subtotal: 120, discount: 20, net: 100, gst: 10, total: 110 })
  })
  it('skips GST when off', () => {
    expect(computeTotals([item(3, 33.33)], 0, false).total).toBe(99.99)
  })
  it('never discounts below zero', () => {
    expect(computeTotals([item(1, 50)], 80, true).total).toBe(0)
  })
  it('rounds cents', () => {
    expect(computeTotals([item(1, 55.55)], 0, true).gst).toBe(5.56)
  })
})

describe('format', () => {
  it('formats AUD', () => {
    expect(money(1234.5)).toBe('$1,234.50')
  })
  it('splits times', () => {
    expect(timeParts('13:05:00')).toEqual({ time: '1:05', ampm: 'pm' })
    expect(timeParts('00:30')).toEqual({ time: '12:30', ampm: 'am' })
  })
  it('formats clocks and ABNs', () => {
    expect(clock(3_723_000)).toBe('01:02:03')
    expect(abn('51824753556')).toBe('51 824 753 556')
  })
})
