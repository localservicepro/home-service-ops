import { ChevronDown } from "lucide-react";
import styles from "./IntegrationToggle.module.css";

// "Manage" / "Done" button that opens and closes a connected integration card's settings.
export function IntegrationToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <span>{open ? "Done" : "Manage"}</span>
      <ChevronDown size={15} className={open ? styles.up : ""} />
    </button>
  );
}
