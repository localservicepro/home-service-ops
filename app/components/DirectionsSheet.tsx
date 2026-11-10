import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ExternalLink, LocateFixed, Loader2, MapPin, RefreshCw } from "lucide-react";
import { decodePolyline } from "../helpers/roadRoute";
import { haversineKm } from "../helpers/routePlanner";
import { opsFormat } from "../helpers/opsFormat";
import { useMyLocation, useRoads } from "../helpers/useRoads";
import type { RoadPoint } from "../endpoints/dispatch/roads_POST.schema";
import { DispatchMap, type MapLine, type MapPin as Pin } from "./DispatchMap";
import { DirectionsView, fmtDrive } from "./DirectionsView";
import styles from "./DirectionsSheet.module.css";

// Full-screen, in-app directions to a job, from where the phone is: the ways to go, the route on
// the map with a dot that follows the driver, and the turns. Google Maps stays one tap away for
// spoken navigation.

export type DirectionsTarget = { address: string; label: string; lat?: number | null; lng?: number | null; color?: string };

export function DirectionsSheet({ open, onClose, to, fromAddress }: { open: boolean; onClose: () => void; to: DirectionsTarget | null; fromAddress?: string }) {
  const { pos, error } = useMyLocation(open);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [picked, setPicked] = useState(0);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setOrigin(null);
      setUseFallback(false);
      setPicked(0);
      setFocus(null);
    }
  }, [open]);
  // Start from the first fix; later fixes only move the dot until "Re-route from here".
  useEffect(() => {
    if (open && pos && !origin) setOrigin({ lat: pos.lat, lng: pos.lng });
  }, [open, pos, origin]);
  // No location after a while (or refused): start from the last job instead, when there is one.
  useEffect(() => {
    if (!open || origin || !fromAddress) return;
    if (error) return setUseFallback(true);
    const t = setTimeout(() => setUseFallback(true), 8000);
    return () => clearTimeout(t);
  }, [open, origin, error, fromAddress]);

  const dest: RoadPoint | null = to ? (to.lat != null && to.lng != null ? { lat: to.lat, lng: to.lng } : to.address ? { address: to.address } : null) : null;
  const start: RoadPoint | null = origin ?? (useFallback && fromAddress ? { address: fromAddress } : null);
  const roads = useRoads(start && dest ? [{ points: [start, dest] }] : [], { alternatives: true, steps: true, enabled: open });
  const answer = roads.data?.results[0];
  const routes = answer?.routes ?? [];
  const chosen = routes[picked] ?? routes[0];
  const paths = useMemo(() => routes.map((r) => decodePolyline(r.polyline, r.precision)), [routes]);

  const lines: MapLine[] = routes.map((r, i) => ({
    key: `alt${i}`,
    color: to?.color || "#1a73e8",
    points: paths[i],
    weight: 6,
    muted: r !== chosen,
    onClick: () => setPicked(i),
    title: r !== chosen ? `${fmtDrive(r.min)}${r.via ? ` via ${r.via}` : ""}` : undefined,
  }));
  const end = chosen ? paths[routes.indexOf(chosen)]?.at(-1) : undefined;
  const pins: Pin[] =
    to && (to.lat != null || end)
      ? [{ id: 1, lat: to.lat ?? end![0], lng: to.lng ?? end![1], color: to.color || "#0C6FD0", label: "", title: to.label }]
      : [];
  const moved = origin && pos ? haversineKm(origin, pos) > 0.3 : false;
  const google = to ? opsFormat.dirUrl(to.address) : undefined;

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !to) return null;
  return createPortal(
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Directions to ${to.label}`}>
      <header className={styles.head}>
        <button type="button" className={styles.back} onClick={onClose} aria-label="Close directions">
          <ArrowLeft size={20} />
        </button>
        <div className={styles.title}>
          <b>{to.label}</b>
          <span>
            <MapPin size={12} /> {to.address}
          </span>
        </div>
        {google && (
          <a className={styles.google} href={google} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Google Maps
          </a>
        )}
      </header>

      <div className={styles.mapBox}>
        <DispatchMap
          pins={pins}
          lines={lines}
          depot={null}
          selectedId={null}
          onSelect={() => undefined}
          fitKey={`${routes.length}:${picked}:${origin?.lat ?? ""}`}
          fitPoints={chosen ? paths[routes.indexOf(chosen)] : pos ? [[pos.lat, pos.lng]] : undefined}
          focus={focus}
          me={pos}
          className={styles.map}
        />
        <div className={styles.mapBtns}>
          {pos && (
            <button type="button" onClick={() => setFocus({ lat: pos.lat, lng: pos.lng, key: `me${Date.now()}` })} aria-label="Show where I am">
              <LocateFixed size={18} />
            </button>
          )}
          {moved && (
            <button type="button" className={styles.reroute} onClick={() => pos && setOrigin({ lat: pos.lat, lng: pos.lng })}>
              <RefreshCw size={15} /> Re-route from here
            </button>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {!start ? (
          <div className={styles.waiting}>
            {error && !fromAddress ? (
              <>{error}</>
            ) : (
              <>
                <Loader2 size={16} className={styles.spin} /> Finding your location…
              </>
            )}
          </div>
        ) : (
          <>
            {!origin && useFallback && <p className={styles.from}>{error ? `${error} ` : ""}Starting from your last job.</p>}
            <DirectionsView
              answer={answer}
              loading={roads.isLoading}
              failed={roads.isError || answer === null}
              picked={routes.indexOf(chosen!) >= 0 ? routes.indexOf(chosen!) : 0}
              onPick={setPicked}
              legLabels={[to.label]}
              onStep={(at, key) => setFocus({ lat: at[0], lng: at[1], key })}
              me={pos}
              googleUrl={google}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
