import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MapPin } from "lucide-react";
import { getAddressSuggest, type AddressSuggestion } from "../endpoints/address/suggest_GET.schema";
import { Input } from "./Input";
import styles from "./AddressInput.module.css";

const newSession = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

// Address box with Google address suggestions (Australia). Typing freely still works; if address
// search isn't set up, it behaves like a plain input.
export function AddressInput({
  value,
  onChange,
  placeholder = "Start typing an address",
  autoFocus,
  onEnter,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Enter pressed with no suggestion highlighted. */
  onEnter?: () => void;
  className?: string;
}) {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [disabled, setDisabled] = useState(false);
  const typed = useRef(false);
  const session = useRef(newSession());
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (!typed.current || disabled || q.length < 4) {
      setItems([]);
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(() => {
      getAddressSuggest({ q, session: session.current })
        .then((r) => {
          if (my !== seq.current) return;
          if (!r.configured) setDisabled(true);
          setItems(r.suggestions);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => my === seq.current && setItems([]));
    }, 280);
    return () => clearTimeout(t);
  }, [value, disabled]);

  const pick = (s: AddressSuggestion) => {
    typed.current = false;
    onChange(s.full);
    setItems([]);
    setOpen(false);
    session.current = newSession(); // the next search is a new billing session
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const shown = open && items.length > 0;
    if (shown && e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (shown && e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (shown && active >= 0) {
        e.preventDefault();
        pick(items[active]);
      } else onEnter?.();
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const shown = open && items.length > 0;
  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <Input
        value={value}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
      />
      {shown && (
        <div className={styles.menu}>
          <ul id={listId} role="listbox" className={styles.list}>
            {items.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? styles.itemOn : styles.item}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <MapPin size={15} className={styles.pin} />
                <span className={styles.text}>
                  <b>{s.main}</b>
                  {s.secondary && <small>{s.secondary}</small>}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.powered}>powered by Google</div>
        </div>
      )}
    </div>
  );
}
