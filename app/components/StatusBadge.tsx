import type { JobStatus, QuoteStatus } from "../helpers/schema";
import { opsFormat } from "../helpers/opsFormat";
import styles from "./StatusBadge.module.css";

export function StatusBadge({
  status,
  quote,
  label,
  solid,
  className,
}: {
  status?: JobStatus;
  quote?: QuoteStatus;
  label?: string;
  solid?: boolean;
  className?: string;
}) {
  const c = quote ? opsFormat.quoteColors(quote) : opsFormat.statusColors(status ?? "New");
  return (
    <span
      className={`${styles.badge} ${className ?? ""}`}
      style={solid ? { color: "#fff", background: c.c } : { color: c.c, background: c.bg }}
    >
      {label ?? quote ?? status}
    </span>
  );
}
