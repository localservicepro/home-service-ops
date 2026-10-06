import { useCallback } from "react";
import { useMe } from "./useMe";

// Which console to show, now driven by the signed-in user's role in their business:
// owners and office admins get the admin console, crew get the field view for their
// own crew record. (setRole/setCrewId remain as no-ops for older callers.)
export function useRole() {
  const { data } = useMe();
  const role: "admin" | "crew" = data?.role === "crew" ? "crew" : "admin";
  const crewId = data?.role === "crew" ? data.staffId : null;
  const setRole = useCallback((_r: "admin" | "crew") => undefined, []);
  const setCrewId = useCallback((_id: number | null) => undefined, []);
  return { role, crewId, setRole, setCrewId, memberRole: data?.role ?? null };
}
