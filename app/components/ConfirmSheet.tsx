import { ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import styles from "./ConfirmSheet.module.css";

// Bottom-sheet confirmation for destructive actions.
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Delete",
  pending,
  onConfirm,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className={className}
      footer={
        <div className={styles.actions}>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" size="lg" onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div className={styles.body}>{body}</div>}
    </BottomSheet>
  );
}
