import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postSupportCreate } from "../endpoints/support/create_POST.schema";
import { TICKET_CATEGORIES, priorityLabel, subjectFrom, type TicketCategory, type TicketPriority } from "../helpers/supportShared";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import styles from "./SupportRequestSheet.module.css";

const URGENCY: TicketPriority[] = ["normal", "high", "urgent"];

// "Message support": a business writes to Local Service Pro. Opened from the Support button in the
// app frame and from Settings → Help & support. The reply arrives in the app and by email.
export function SupportRequestSheet({
  open,
  onOpenChange,
  onCreated,
  showListLink = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (id: number) => void;
  showListLink?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const reset = () => {
    setCategory(null);
    setPriority("normal");
    setSubject("");
    setBody("");
  };
  const create = useMutation({
    mutationFn: () =>
      postSupportCreate({
        subject: (subject.trim() || subjectFrom(body)).padEnd(3, "."),
        body: body.trim(),
        category: category ?? "other",
        priority,
        origin: window.location.origin,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["support"] });
      onOpenChange(false);
      reset();
      if (onCreated) {
        toast.success("Message sent. We'll reply here and by email.");
        onCreated(r.id);
      } else {
        toast.success("Message sent. We'll reply in the app and by email.", {
          action: { label: "View", onClick: () => navigate(`/support?t=${r.id}`) },
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  const valid = body.trim().length >= 5;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Message support"
      description="Local Service Pro usually replies within one business day."
      footer={
        <Button size="lg" onClick={() => create.mutate()} disabled={!valid || create.isPending}>
          {create.isPending ? "Sending…" : "Send message"}
        </Button>
      }
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span>How can we help?</span>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Ask a question, tell us what's not working, or suggest something for the app."
            maxLength={5000}
          />
        </label>
        <div className={styles.field}>
          <span>
            What's it about? <i>Optional</i>
          </span>
          <div className={styles.chips}>
            {TICKET_CATEGORIES.map((c) => (
              <Chip key={c.k} type="button" selected={category === c.k} onClick={() => setCategory(category === c.k ? null : c.k)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
        <label className={styles.field}>
          <span>
            Subject <i>Optional</i>
          </span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={body.trim() ? subjectFrom(body, 60) : "e.g. Can't send a quote"} maxLength={140} />
        </label>
        <div className={styles.field}>
          <span>How urgent?</span>
          <div className={styles.segs} role="radiogroup" aria-label="How urgent">
            {URGENCY.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={priority === p} className={priority === p ? styles.segOn : styles.seg} onClick={() => setPriority(p)}>
                {p === "normal" ? "Not urgent" : priorityLabel(p)}
              </button>
            ))}
          </div>
          <small>Urgent = you can't work. We look at it first.</small>
        </div>
        {showListLink && (
          <Link to="/support" className={styles.listLink} onClick={() => onOpenChange(false)}>
            See your earlier messages →
          </Link>
        )}
      </div>
    </BottomSheet>
  );
}
