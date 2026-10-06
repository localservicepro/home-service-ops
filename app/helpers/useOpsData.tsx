import { useQuery } from "@tanstack/react-query";
import { getOpsSnapshot } from "../endpoints/ops/snapshot_GET.schema";

const OPS_QUERY_KEY = ["ops", "snapshot"] as const;

// Single source of truth for the whole app (a small business dataset).
export function useOpsData() {
  return useQuery({
    queryKey: OPS_QUERY_KEY,
    queryFn: () => getOpsSnapshot(),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}
