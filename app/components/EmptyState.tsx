import { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export function EmptyState({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`${styles.empty} ${className ?? ""}`}>
      <div className={styles.title}>{title}</div>
      {body && <div className={styles.body}>{body}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
