import { useQuery } from "@tanstack/react-query";
import { getInboxThreads } from "../endpoints/inbox/threads_GET.schema";
import { toE164 } from "./phone";

export const INBOX_KEY = ["inbox", "threads"] as const;

/** Conversation list; the shell polls it for the unread badge, the inbox page more often. */
export function useInboxThreads(opts: { enabled?: boolean; poll?: number } = {}) {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: () => getInboxThreads(),
    enabled: opts.enabled ?? true,
    refetchInterval: opts.poll ?? 60_000,
    staleTime: 10_000,
    retry: false,
  });
}

/** +61412345678 → 0412 345 678 (other numbers as given). */
export function fmtPhone(e164: string) {
  const m = /^\+61(4\d{2})(\d{3})(\d{3})$/.exec(e164);
  if (m) return `0${m[1]} ${m[2]} ${m[3]}`;
  const l = /^\+61([2378])(\d{4})(\d{4})$/.exec(e164);
  if (l) return `(0${l[1]}) ${l[2]} ${l[3]}`;
  return e164;
}

/** Inbox link for a client's number, or null when it isn't textable. */
export const inboxLink = (phone: string) => {
  const p = toE164(phone);
  return p ? `/inbox?c=${encodeURIComponent(p)}` : null;
};
