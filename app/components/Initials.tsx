import { opsFormat } from "../helpers/opsFormat";
import styles from "./Initials.module.css";

export function Initials({
  name,
  color,
  size = 36,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`${styles.circle} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: color ?? "var(--signal-gradient)",
      }}
      aria-hidden
    >
      {opsFormat.initials(name)}
    </span>
  );
}
