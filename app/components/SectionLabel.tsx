import { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

export function SectionLabel({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`${styles.row} ${className ?? ""}`}>
      <span className={styles.label}>{children}</span>
      {action}
    </div>
  );
}
