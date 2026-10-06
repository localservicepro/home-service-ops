import { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./Sheet";
import styles from "./BottomSheet.module.css";

// Mobile-style sheet that slides up from the bottom (centred on wide screens).
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={`${styles.sheet} ${className ?? ""}`}>
        <div className={styles.grabber} aria-hidden />
        <SheetHeader className={styles.header}>
          <SheetTitle className={styles.title}>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className={styles.srOnly}>{typeof title === "string" ? title : "Details"}</SheetDescription>
          )}
        </SheetHeader>
        <div className={styles.body}>{children}</div>
        {footer && <SheetFooter className={styles.footer}>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
