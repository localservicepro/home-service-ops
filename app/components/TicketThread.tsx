import { useEffect, useRef } from "react";
import type { TicketMessage } from "../helpers/supportShared";
import styles from "./TicketThread.module.css";

const stamp = (d: Date) =>
  new Date(d).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// A support conversation. `mine` decides which side is "us" (the business, or staff in /admin).
export function TicketThread({ messages, mine }: { messages: TicketMessage[]; mine: "customer" | "staff" }) {
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);
  return (
    <div className={styles.thread}>
      {messages.map((m) => {
        const ours = mine === "staff" ? m.fromStaff : !m.fromStaff;
        return (
          <div key={m.id} className={`${styles.msg} ${ours ? styles.ours : styles.theirs}`}>
            <small>
              {m.authorName} · {stamp(m.createdAt)}
            </small>
            <div className={styles.bubble}>{m.body}</div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
