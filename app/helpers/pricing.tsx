export type PricedLine = { qty: number | string; price: number | string };

function toNum(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

function calcTotals(lines: PricedLine[], discount: unknown, gst: boolean) {
  const sub = (lines || []).reduce(
    (a, l) => a + Math.max(1, parseInt(String(l.qty), 10) || 1) * toNum(l.price),
    0,
  );
  const disc = Math.min(sub, Math.max(0, toNum(discount)));
  const g = gst ? (sub - disc) * 0.1 : 0;
  return { sub: round2(sub), disc: round2(disc), gst: round2(g), total: round2(sub - disc + g) };
}

function fmtMoney(n: number): string {
  return (
    "$" +
    round2(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function moneyShort(n: number): string {
  const r = round2(n);
  return (
    "$" +
    (Number.isInteger(r)
      ? r.toLocaleString("en-AU")
      : r.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  );
}

export const pricing = { toNum, round2, calcTotals, fmtMoney, moneyShort };
