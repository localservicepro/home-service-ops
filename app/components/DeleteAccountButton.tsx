import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { postAccountDelete } from "../endpoints/account/delete_POST.schema";
import { useAuth } from "../helpers/useAuth";
import { useMe } from "../helpers/useMe";
import { ConfirmSheet } from "./ConfirmSheet";
import { Input } from "./Input";
import styles from "./DeleteAccountButton.module.css";

// Permanent account deletion (required for apps on Google Play). Owners take the business with them.
export function DeleteAccountButton({ className }: { className?: string }) {
  const { data: me } = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const owner = me?.role === "owner";

  const run = async () => {
    if (typed.trim().toUpperCase() !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    setPending(true);
    try {
      await postAccountDelete({ confirm: "DELETE" });
      await logout().catch(() => {});
      qc.clear();
      toast.success("Your account has been deleted.");
      navigate("/login", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete your account");
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" className={`${styles.link} ${className ?? ""}`} onClick={() => { setTyped(""); setOpen(true); }}>
        <Trash2 size={14} /> Delete my account
      </button>
      <ConfirmSheet
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        title="Delete your account?"
        confirmLabel="Delete forever"
        pending={pending}
        onConfirm={run}
        body={
          <div className={styles.body}>
            {owner ? (
              <p>
                This permanently deletes your login <b>and {me?.businessName || "your business"}</b>: every client, quote, job,
                invoice, photo and team login. Any paid plan is cancelled straight away. This can't be undone.
              </p>
            ) : (
              <p>
                This permanently deletes your login. {me?.businessName ? <>The work you did for <b>{me.businessName}</b> stays with the business.</> : null}
              </p>
            )}
            <label className={styles.label}>
              Type <b>DELETE</b> to confirm
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="DELETE" />
            </label>
          </div>
        }
      />
    </>
  );
}
