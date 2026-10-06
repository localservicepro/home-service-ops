import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import styles from "./PhotoGallery.module.css";

/** Thumbnail grid that opens a full-screen viewer (arrows / swipe / keyboard). */
export function PhotoGallery({ photos, size = "md", className }: { photos: string[]; size?: "sm" | "md" | "lg"; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = photos.length;
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + count) % count)), [count]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, go]);

  const [touchX, setTouchX] = useState<number | null>(null);
  if (!count) return null;

  return (
    <>
      <div className={`${styles.grid} ${styles[size]} ${className ?? ""}`}>
        {photos.map((p, i) => (
          <button key={p} type="button" className={styles.thumb} onClick={() => setOpen(i)} aria-label={`View photo ${i + 1} of ${count}`}>
            <img src={p} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null &&
        createPortal(
          <div
            className={styles.viewer}
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
            onClick={(e) => e.target === e.currentTarget && setOpen(null)}
            onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX === null) return;
              const dx = e.changedTouches[0].clientX - touchX;
              if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
              setTouchX(null);
            }}
          >
            <div className={styles.bar}>
              <span>
                {open + 1} / {count}
              </span>
              <div className={styles.barBtns}>
                <a href={photos[open]} target="_blank" rel="noreferrer" download className={styles.iconBtn} aria-label="Open original">
                  <Download size={18} />
                </a>
                <button type="button" className={styles.iconBtn} onClick={() => setOpen(null)} aria-label="Close">
                  <X size={20} />
                </button>
              </div>
            </div>
            <img src={photos[open]} alt={`Photo ${open + 1}`} className={styles.big} />
            {count > 1 && (
              <>
                <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => go(-1)} aria-label="Previous photo">
                  <ChevronLeft size={26} />
                </button>
                <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => go(1)} aria-label="Next photo">
                  <ChevronRight size={26} />
                </button>
                <div className={styles.strip}>
                  {photos.map((p, i) => (
                    <button key={p} type="button" className={`${styles.mini} ${i === open ? styles.miniOn : ""}`} onClick={() => setOpen(i)} aria-label={`Photo ${i + 1}`}>
                      <img src={p} alt="" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

