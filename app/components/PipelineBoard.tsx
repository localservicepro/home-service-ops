import { ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { Initials } from "./Initials";
import styles from "./PipelineBoard.module.css";

// Kanban-style pipeline used by the Quotes and Jobs tabs. Tablet/desktop show every stage
// as a column (drag cards between columns where a move is allowed); phones show one stage
// at a time behind stage tabs.

export type BoardTone = "new" | "quote" | "scheduled" | "progress" | "done" | "paid" | "cancelled";

export type BoardColumn = {
  key: string;
  label: string;
  tone: BoardTone;
  count: number;
  hint?: string;
  empty: string;
  cards: ReactNode[];
  /** Called with the dragged card's id when a card is dropped here. Omit to refuse drops. */
  onDrop?: (dragId: string) => void;
  /** Which dragged cards this column accepts (by id prefix, e.g. "job:"). */
  accepts?: (dragId: string) => boolean;
};

export function PipelineBoard({ columns, initial }: { columns: BoardColumn[]; initial?: string }) {
  const [mobileKey, setMobileKey] = useState(initial ?? columns[0]?.key);
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const active = columns.find((c) => c.key === mobileKey) ? mobileKey : columns[0]?.key;

  return (
    <div
      className={`${styles.wrap} ${dragging ? styles.isDragging : ""}`}
      onDragStart={(e) => {
        const id = (e.target as HTMLElement).closest?.("[data-drag]")?.getAttribute("data-drag");
        if (id) setDragging(id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
    >
      <div className={styles.tabs} role="tablist" aria-label="Stages">
        {columns.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={c.key === active}
            className={`${styles.tab} ${c.key === active ? styles.tabOn : ""}`}
            onClick={() => setMobileKey(c.key)}
          >
            <span className={styles.dot} style={{ background: `var(--status-${c.tone})` }} />
            {c.label}
            <span className={styles.tabCount}>{c.count}</span>
          </button>
        ))}
      </div>

      <div className={styles.board} style={{ ["--cols" as string]: columns.length }}>
        {columns.map((c) => {
          const canDrop = !!c.onDrop && !!dragging && (c.accepts ? c.accepts(dragging) : true);
          return (
            <section
              key={c.key}
              className={`${styles.col} ${c.key === active ? styles.colOn : ""} ${canDrop ? styles.canDrop : ""} ${
                canDrop && over === c.key ? styles.over : ""
              }`}
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== c.key) setOver(c.key);
              }}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragging;
                setOver(null);
                setDragging(null);
                if (id && canDrop) c.onDrop?.(id);
              }}
            >
              <header className={styles.colHead}>
                <span className={styles.dot} style={{ background: `var(--status-${c.tone})` }} />
                <b>{c.label}</b>
                <span className={styles.colCount}>{c.count}</span>
              </header>
              {c.hint && <p className={styles.colHint}>{c.hint}</p>}
              <div className={styles.cards}>
                {c.cards.length ? c.cards : <div className={styles.empty}>{canDrop ? "Drop here" : c.empty}</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function BoardCard({
  to,
  dragId,
  num,
  title,
  customer,
  when,
  price,
  staff,
  tag,
  onOpen,
}: {
  to?: string;
  dragId?: string;
  num: string;
  title: string;
  customer: string;
  when?: string;
  price?: string;
  staff?: { name: string; color?: string } | null;
  tag?: ReactNode;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <div className={styles.cardTop}>
        <span className={styles.num}>{num}</span>
        {tag}
      </div>
      <b className={styles.title}>{title || "Service TBC"}</b>
      <span className={styles.customer}>{customer}</span>
      <div className={styles.cardFoot}>
        <span className={styles.when}>{when}</span>
        {price && <span className={styles.price}>{price}</span>}
        {staff === null ? (
          <span className={styles.unassigned} title="Unassigned">?</span>
        ) : staff ? (
          <span title={staff.name}>
            <Initials name={staff.name} color={staff.color} size={22} />
          </span>
        ) : null}
      </div>
    </>
  );
  const dragProps = dragId
    ? {
        draggable: true,
        "data-drag": dragId,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData("text/plain", dragId);
          e.dataTransfer.effectAllowed = "move";
        },
      }
    : {};
  if (onOpen) {
    return (
      <button type="button" className={styles.card} onClick={onOpen} {...dragProps}>
        {body}
      </button>
    );
  }
  return (
    <Link to={to ?? "#"} className={styles.card} {...dragProps}>
      {body}
    </Link>
  );
}
