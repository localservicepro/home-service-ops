import type { LineItem } from './types'

export const GST_RATE = 0.1

export interface Totals {
  subtotal: number
  discount: number
  net: number
  gst: number
  total: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Line prices are GST-exclusive. Discount is a dollar amount off the subtotal.
 * Mirrors public.compute_total() in the database.
 */
export function computeTotals(items: LineItem[], discount = 0, withGst = true): Totals {
  const subtotal = round2(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0))
  const disc = round2(Math.min(Math.max(Number(discount) || 0, 0), subtotal))
  const net = round2(subtotal - disc)
  const gst = withGst ? round2(net * GST_RATE) : 0
  return { subtotal, discount: disc, net, gst, total: round2(net + gst) }
}

export const lineTotal = (i: LineItem) => round2((Number(i.qty) || 0) * (Number(i.unit_price) || 0))
