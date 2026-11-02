import { ReactNode } from "react";
import type { PublicDoc } from "../helpers/publicDocs";
import { pricing } from "../helpers/pricing";
import styles from "./DocView.module.css";

// Printable customer-facing quote / invoice. `actions` renders under the totals.
export function DocView({ doc, badge, actions, className }: { doc: PublicDoc; badge?: ReactNode; actions?: ReactNode; className?: string }) {
  const b = doc.business;
  const date = new Date(doc.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className={`${styles.page} ${className ?? ""}`}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <div>
            <div className={styles.biz}>{b.name}</div>
            <div className={styles.bizMeta}>
              {[b.phone, b.email, b.website].filter(Boolean).join(" · ")}
              {b.abn && <><br />ABN {b.abn}</>}
            </div>
          </div>
          <div className={styles.docType}>
            <span>{doc.kind === "quote" ? "Quote" : "Tax invoice"}</span>
            <b>{doc.num}</b>
            <small>{date}</small>
          </div>
        </header>
        {badge}
        <div className={styles.to}>
          <span>{doc.kind === "quote" ? "Prepared for" : "Billed to"}</span>
          <b>{doc.customer}</b>
          {doc.address && <small>{doc.address}</small>}
        </div>
        <table className={styles.table}>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i} className={l.addon ? styles.addon : ""}>
                <td>{l.addon ? "+ " : ""}{l.name}</td>
                <td>{l.qty}</td>
                <td>{pricing.fmtMoney(l.qty * l.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.totals}>
          <div><span>Subtotal</span><span>{pricing.fmtMoney(doc.sub)}</span></div>
          {doc.disc > 0 && <div><span>Discount</span><span>−{pricing.fmtMoney(doc.disc)}</span></div>}
          {doc.gst > 0 && <div><span>GST (10%)</span><span>{pricing.fmtMoney(doc.gst)}</span></div>}
          <div className={styles.grand}><span>Total{doc.gst > 0 ? " inc GST" : ""}</span><span>{pricing.fmtMoney(doc.total)}</span></div>
        </div>
        {doc.note && <p className={styles.note}>{doc.note}</p>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <p className={styles.footer}>Sent with Home Service Ops by Local Service Pro</p>
    </div>
  );
}
