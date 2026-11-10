import { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Chip.module.css";

export function Chip({
  selected,
  children,
  className,
  ...props
}: { selected?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={!!selected}
      className={`${styles.chip} ${selected ? styles.on : ""} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
