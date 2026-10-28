import { useQuery } from "@tanstack/react-query";
import { getAccountMe } from "../endpoints/account/me_GET.schema";
import { useAuth } from "./useAuth";

export const ME_QUERY_KEY = ["account", "me"] as const;

// The signed-in user's business and role there. Only runs once signed in.
export function useMe() {
  const { authState } = useAuth();
  const signedIn = authState.type === "authenticated";
  const q = useQuery({
    queryKey: [...ME_QUERY_KEY, signedIn ? authState.user.id : 0],
    queryFn: () => getAccountMe(),
    enabled: signedIn,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  return { ...q, authState };
}

export const roleLabel = (r: string) => (r === "owner" ? "Owner" : r === "admin" ? "Office admin" : "Crew");
