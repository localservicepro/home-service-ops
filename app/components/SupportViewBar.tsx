import { useEffect, useState } from "react";
import { Eye, PencilLine, X } from "lucide-react";
import { getSupportView, leaveSupportView } from "../helpers/supportView";
import { postAdminViewAsEnd } from "../endpoints/admin/view_as_end_POST.schema";
import styles from "./SupportViewBar.module.css";

// Shown on every page while staff are viewing a customer's account (this tab only).
export function SupportViewBar() {
  const [view, setView] = useState(getSupportView);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!view) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (!getSupportView()) setView(null);
    }, 30_000);
    return () => clearInterval(t);
  }, [view]);
  useEffect(() => {
    document.documentElement.classList.toggle("hso-support-view", !!view);
  }, [view]);
  if (!view) return null;
  const mins = Math.max(0, Math.round((new Date(view.expiresAt).getTime() - now) / 60_000));
  const exit = () => {
    postAdminViewAsEnd({ sessionId: view.id }).catch(() => undefined).finally(() => leaveSupportView());
  };
  return (
    <div className={`${styles.bar} ${view.allowChanges ? styles.edit : ""}`} role="status">
      {view.allowChanges ? <PencilLine size={15} /> : <Eye size={15} />}
      <span className={styles.text}>
        Viewing <b>{view.businessName}</b> as support · {view.allowChanges ? "changes allowed and recorded" : "read-only"} · {mins} min left
      </span>
      <button type="button" onClick={exit} className={styles.exit}>
        <X size={14} /> Exit
      </button>
    </div>
  );
}
