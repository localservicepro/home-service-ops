import { ReactNode } from "react";
import { Zap } from "lucide-react";
import styles from "./AuthScreen.module.css";

// Full-screen navy frame for sign-in, sign-up and invite pages.
export function AuthScreen({ title, subtitle, children, className }: { title: string; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.stage} ${className ?? ""}`}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.logo}><Zap size={18} fill="currentColor" strokeWidth={0} /></span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>Local Service Pro</span>
            <span className={styles.brandTag}>HOME SERVICE OPS</span>
          </span>
        </div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
}
