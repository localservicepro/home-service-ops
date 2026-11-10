import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./DispatchMap.module.css";

// The Dispatch tab's map (Leaflet). Pins are coloured by crew member and numbered in route order;
// routes are drawn stop to stop. Map tiles come from OpenStreetMap unless VITE_MAP_TILE_URL is set
// (with VITE_MAP_ATTRIBUTION), e.g. for a paid tile provider on a busy account.

export type MapPin = {
  id: number;
  lat: number;
  lng: number;
  color: string;
  /** Route position, or "" for none. */
  label: string;
  /** An unscheduled request: drawn hollow. */
  hollow?: boolean;
  /** Dimmed (filtered out but kept for context). */
  faded?: boolean;
  title: string;
};
export type MapLine = { key: string; color: string; points: [number, number][]; dashed?: boolean };

const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
// Brisbane, until there's something to show.
const FALLBACK: [number, number] = [-27.47, 153.02];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pinIcon(p: MapPin, selected: boolean) {
  const cls = [styles.pin, p.hollow ? styles.hollow : "", p.faded ? styles.faded : "", selected ? styles.selected : ""].join(" ");
  return L.divIcon({
    className: styles.pinWrap,
    html: `<span class="${cls}" style="--pin:${esc(p.color)}"><b>${esc(p.label)}</b></span>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
  });
}

const depotIcon = L.divIcon({
  className: styles.pinWrap,
  html: `<span class="${styles.depot}" title="Yard"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></span>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export function DispatchMap({
  pins,
  lines,
  depot,
  selectedId,
  onSelect,
  fitKey,
  className,
}: {
  pins: MapPin[];
  lines: MapLine[];
  depot: { lat: number; lng: number } | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Change it to zoom the map to everything on it (e.g. a new day). */
  fitKey: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const lineLayer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<number, L.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(FALLBACK, 10);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
    lineLayer.current = L.layerGroup().addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    m.on("click", () => select.current(null));
    map.current = m;
    // The container can change size after layout (side panel, mobile); keep tiles filling it.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Routes.
  useEffect(() => {
    const g = lineLayer.current;
    if (!g) return;
    g.clearLayers();
    for (const l of lines) {
      if (l.points.length < 2) continue;
      L.polyline(l.points, { color: "#ffffff", weight: 7, opacity: 0.85 }).addTo(g);
      L.polyline(l.points, { color: l.color, weight: 4, opacity: 0.9, dashArray: l.dashed ? "6 8" : undefined }).addTo(g);
    }
  }, [lines]);

  // Pins and the yard.
  useEffect(() => {
    const g = pinLayer.current;
    if (!g) return;
    g.clearLayers();
    markers.current.clear();
    if (depot) L.marker([depot.lat, depot.lng], { icon: depotIcon, keyboard: false, title: "Yard", zIndexOffset: -100 }).addTo(g);
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p, p.id === selectedId), title: p.title, riseOnHover: true, zIndexOffset: p.id === selectedId ? 1000 : p.faded ? -50 : 0 });
      mk.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        select.current(p.id);
      });
      mk.addTo(g);
      markers.current.set(p.id, mk);
    }
  }, [pins, depot, selectedId]);

  // Zoom to fit when asked.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts: [number, number][] = pins.filter((p) => !p.faded).map((p) => [p.lat, p.lng]);
    if (depot) pts.push([depot.lat, depot.lng]);
    if (pts.length === 1) m.setView(pts[0], 14);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Bring the selected job into view.
  useEffect(() => {
    const m = map.current;
    const mk = selectedId != null ? markers.current.get(selectedId) : undefined;
    if (!m || !mk) return;
    if (!m.getBounds().pad(-0.1).contains(mk.getLatLng())) m.panTo(mk.getLatLng());
  }, [selectedId]);

  return <div ref={el} className={`${styles.map} ${className ?? ""}`} role="application" aria-label="Map of jobs" />;
}
