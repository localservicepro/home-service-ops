import { useEffect, useMemo, useRef } from "react";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  CornerLeftDown,
  CornerRightDown,
  Undo2,
  RotateCw,
  Merge,
  Split,
  Flag,
  Navigation2,
  Loader2,
  TrafficCone,
  type LucideIcon,
} from "lucide-react";
import { fmtDistance, type RoadProvider, type RoadRoute, type TurnIcon } from "../helpers/roadRoute";
import { haversineKm } from "../helpers/routePlanner";
import styles from "./DirectionsView.module.css";

// In-app directions: the ways to get there (fastest first) and the turn-by-turn list for the one
// picked. Used by the Dispatch tab and by crew on their phones.

const ICONS: Record<TurnIcon, LucideIcon> = {
  depart: Navigation2,
  arrive: Flag,
  straight: ArrowUp,
  left: CornerUpLeft,
  right: CornerUpRight,
  "slight-left": ArrowUpLeft,
  "slight-right": ArrowUpRight,
  "sharp-left": CornerLeftDown,
  "sharp-right": CornerRightDown,
  uturn: Undo2,
  roundabout: RotateCw,
  merge: Merge,
  "fork-left": Split,
  "fork-right": Split,
  ramp: ArrowUpRight,
};

export const fmtDrive = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min` : `${Math.max(1, Math.round(m))} min`);

/** The step nearest the driver (within 300 m), as [leg, step]. */
export function nearestStep(route: RoadRoute | undefined, me: { lat: number; lng: number } | null | undefined): [number, number] | null {
  if (!route || !me) return null;
  let best: [number, number] | null = null;
  let bestKm = 0.3;
  route.legs.forEach((l, li) =>
    l.steps.forEach((s, si) => {
      const d = haversineKm(me, { lat: s.at[0], lng: s.at[1] });
      if (d < bestKm) {
        bestKm = d;
        best = [li, si];
      }
    }),
  );
  return best;
}

export function DirectionsView({
  answer,
  loading,
  failed,
  picked,
  onPick,
  legLabels,
  onStep,
  me,
  googleUrl,
  compact,
}: {
  answer: { routes: RoadRoute[]; provider: RoadProvider } | null | undefined;
  loading?: boolean;
  failed?: boolean;
  /** Which way is chosen (index into routes). */
  picked: number;
  onPick: (i: number) => void;
  /** Where each leg ends, e.g. "1. Sarah Mitchell". */
  legLabels?: string[];
  /** Show a turn on the map. */
  onStep?: (at: [number, number], key: string) => void;
  /** The driver's position: the nearest turn is marked. */
  me?: { lat: number; lng: number } | null;
  /** Hand over to Google Maps for spoken navigation. */
  googleUrl?: string;
  compact?: boolean;
}) {
  const routes = answer?.routes ?? [];
  const route = routes[picked] ?? routes[0];
  const fastest = routes.length ? Math.min(...routes.map((r) => r.min)) : 0;
  const here = useMemo(() => nearestStep(route, me), [route, me?.lat, me?.lng]);
  const hereRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    hereRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [here?.[0], here?.[1]]);

  if (loading)
    return (
      <div className={styles.state}>
        <Loader2 size={16} className={styles.spin} /> Finding the best way…
      </div>
    );
  if (failed || !route)
    return (
      <div className={styles.state}>
        No road route could be found right now.
        {googleUrl && (
          <a href={googleUrl} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
        )}
      </div>
    );

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      {routes.length > 1 ? (
        <div className={styles.ways} role="radiogroup" aria-label="Ways to go">
          {routes.map((r, i) => (
            <button key={i} type="button" role="radio" aria-checked={r === route} className={`${styles.way} ${r === route ? styles.wayOn : ""}`} onClick={() => onPick(i)}>
              <b>{fmtDrive(r.min)}</b>
              <span>
                {fmtDistance(r.km)}
                {r.via ? ` · via ${r.via}` : ""}
              </span>
              {r.min === fastest ? <em className={styles.fastest}>Fastest</em> : <em>+{fmtDrive(r.min - fastest)}</em>}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.summary}>
          <b>{fmtDrive(route.min)}</b>
          <span>
            {fmtDistance(route.km)}
            {route.via ? ` · via ${route.via}` : ""}
          </span>
        </div>
      )}
      {route.traffic && (
        <p className={styles.traffic}>
          <TrafficCone size={13} /> Includes current traffic
        </p>
      )}

      <ol className={styles.steps}>
        {route.legs.map((leg, li) => (
          <li key={li} className={styles.leg}>
            {route.legs.length > 1 && (
              <div className={styles.legHead}>
                <b>{legLabels?.[li] ?? `Stop ${li + 1}`}</b>
                <span>
                  {fmtDrive(leg.min)} · {fmtDistance(leg.km)}
                </span>
              </div>
            )}
            <ol>
              {leg.steps.map((s, si) => {
                const Icon = ICONS[s.icon] ?? ArrowUp;
                const text = s.icon === "arrive" && legLabels?.[li] ? s.text.replace("the destination", legLabels[li].replace(/^\d+\.\s*/, "")) : s.text;
                const isHere = here?.[0] === li && here?.[1] === si;
                return (
                  <li key={si} ref={isHere ? hereRef : undefined} className={isHere ? styles.here : ""}>
                    <button type="button" onClick={() => onStep?.(s.at, `${picked}:${li}:${si}`)} disabled={!onStep}>
                      <span className={`${styles.icon} ${s.icon === "arrive" ? styles.iconEnd : ""}`}>
                        <Icon size={16} />
                      </span>
                      <span className={styles.text}>{text}</span>
                      {s.km > 0 && <span className={styles.dist}>{fmtDistance(s.km)}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>

      <p className={styles.fine}>
        {answer!.provider === "google" ? "Directions and traffic by Google." : "Directions from OpenStreetMap. Times don't include traffic."}
        {googleUrl && (
          <>
            {" "}
            <a href={googleUrl} target="_blank" rel="noreferrer">
              Spoken directions in Google Maps
            </a>
          </>
        )}
      </p>
    </div>
  );
}
