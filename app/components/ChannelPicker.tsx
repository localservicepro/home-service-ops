import { Mail, MessageSquare, Layers } from "lucide-react";
import styles from "./ChannelPicker.module.css";

export type Channel = "email" | "sms" | "both";
const OPTS: { v: Channel; label: string; Icon: typeof Mail }[] = [
  { v: "email", label: "Email", Icon: Mail },
  { v: "sms", label: "SMS", Icon: MessageSquare },
  { v: "both", label: "Both", Icon: Layers },
];

// Email / SMS / Both segmented choice.
export function ChannelPicker({ value, onChange, label, className }: { value: Channel; onChange: (c: Channel) => void; label: string; className?: string }) {
  return (
    <div className={`${styles.group} ${className ?? ""}`} role="radiogroup" aria-label={label}>
      {OPTS.map(({ v, label: l, Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? styles.on : styles.opt} onClick={() => onChange(v)}>
          <Icon size={14} /> {l}
        </button>
      ))}
    </div>
  );
}
