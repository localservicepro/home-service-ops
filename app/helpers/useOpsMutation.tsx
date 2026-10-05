import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Msg<TIn, TOut> = string | ((out: TOut, input: TIn) => string) | null;

// Wraps any ops endpoint call: refreshes the shared snapshot and shows a toast.
export function useOpsMutation<TIn, TOut>(
  fn: (input: TIn) => Promise<TOut>,
  success: Msg<TIn, TOut> = null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (out, input) => {
      await qc.invalidateQueries({ queryKey: ["ops"] });
      const m = typeof success === "function" ? success(out, input) : success;
      if (m) toast.success(m);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    },
  });
}
