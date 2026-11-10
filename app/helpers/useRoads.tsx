import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { postDispatchRoads, type RoadPoint } from "../endpoints/dispatch/roads_POST.schema";

/**
 * Road routes for the map and for in-app directions. One request covers every route asked for;
 * answers are cached on the server too, so redrawing the same day is quick.
 */
export function useRoads(routes: { points: RoadPoint[] }[], opts: { alternatives?: boolean; steps?: boolean; enabled?: boolean } = {}) {
  const usable = routes.filter((r) => r.points.length >= 2).slice(0, 12);
  const key = JSON.stringify([usable.map((r) => r.points), !!opts.alternatives, !!opts.steps]);
  return useQuery({
    queryKey: ["roads", key],
    queryFn: () => postDispatchRoads({ routes: usable, alternatives: opts.alternatives, steps: opts.steps }),
    enabled: (opts.enabled ?? true) && usable.length > 0,
    staleTime: opts.steps ? 5 * 60_000 : 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

export type MyPosition = { lat: number; lng: number; accuracy: number };

/**
 * The device's position while `on`: watched, so a blue dot can follow the driver. `error` says why
 * there's none (permission refused, no GPS).
 */
export function useMyLocation(on: boolean) {
  const [pos, setPos] = useState<MyPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  useEffect(() => {
    if (!on) return;
    if (!("geolocation" in navigator)) {
      setError("This device can't share its location.");
      return;
    }
    setError(null);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setError(null);
      },
      (e) => setError(e.code === e.PERMISSION_DENIED ? "Location is turned off for this app. Allow it in your browser or phone settings." : "Couldn't find your location."),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    };
  }, [on]);
  return { pos, error };
}
