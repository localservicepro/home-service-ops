import React from "react";
import { Zap } from "lucide-react";
import styles from "./AuthLoadingState.module.css";

interface AuthLoadingStateProps {
  title?: string;
  className?: string;
}

// Full-screen branded splash for every "getting you in" step (Google return, session check,
// loading the business). Every step uses the same screen, so moving between them reads as one
// continuous load instead of a series of flashes.
export const AuthLoadingState: React.FC<AuthLoadingStateProps> = ({ title = "Signing you in", className }) => {
  return (
    <div className={`${styles.container} ${className || ""}`} role="status" aria-live="polite">
      <div className={styles.content}>
        <span className={styles.mark}>
          <Zap size={22} />
        </span>
        <div className={styles.brand}>
          <b>Home Service Ops</b>
          <small>BY LOCAL SERVICE PRO</small>
        </div>
        <div className={styles.bar}>
          <i />
        </div>
        <p className={styles.title}>{title}…</p>
      </div>
    </div>
  );
};
