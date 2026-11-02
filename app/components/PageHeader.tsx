import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import styles from "./PageHeader.module.css";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  back,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  back?: string | true;
  right?: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className={`${styles.header} ${className ?? ""}`}>
      {back && (
        <button
          className={styles.back}
          aria-label="Back"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className={styles.text}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </div>
  );
}
