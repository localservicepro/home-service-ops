import { Fragment } from "react";
import styles from "./JobDetailsList.module.css";

const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {decodeURIComponent(part.split("/").pop()?.split("?")[0] || "Open file")}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// Read-only job details (custom fields), e.g. lawn size or gate code synced from LeadConnector.
export function JobDetailsList({ fields, className }: { fields: { label: string; value: string }[]; className?: string }) {
  if (!fields.length) return null;
  return (
    <dl className={`${styles.list} ${className ?? ""}`}>
      {fields.map((f, i) => (
        <div key={`${f.label}-${i}`} className={styles.row}>
          <dt>{f.label}</dt>
          <dd>{linkify(f.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
