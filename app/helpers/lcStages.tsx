// Shared (browser + server): the app's pipeline stages that map onto LeadConnector stages.

export const STAGE_KEYS = ["new", "quoted", "booked", "done", "paid", "lost"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type StageMap = Partial<Record<StageKey, string>>;

export const STAGE_LABELS: Record<StageKey, { label: string; hint: string }> = {
  new: { label: "New request", hint: "New leads come in from this stage" },
  quoted: { label: "Quote sent", hint: "A quote has gone to the customer" },
  booked: { label: "Booked", hint: "Job scheduled or in progress" },
  done: { label: "Job done", hint: "Work finished, awaiting payment" },
  paid: { label: "Paid", hint: "Marked won in LeadConnector" },
  lost: { label: "Lost", hint: "Quote declined or job cancelled (marked lost)" },
};

// Best-guess mapping from LeadConnector stage names, used to pre-fill the settings.
// Patterns are tried strongest first, so "Quote Sent" wins over "Request Quote".
const GUESS: Record<StageKey, RegExp[]> = {
  new: [/\bnew\b|enquir|inquir|incoming/i, /lead|contact/i],
  quoted: [/(quote|estimate|proposal).{0,3}sent/i, /quot|estimat|proposal/i],
  booked: [/book|schedul|appoint/i, /accept|confirm|\bwon\b/i],
  done: [/complet|\bdone\b|finish/i, /invoic/i],
  paid: [/paid|payment/i, /closed.?won/i],
  lost: [/lost|declin|cancel|dead/i],
};
export function guessStageMap(stages: { id: string; name: string }[]): StageMap {
  const map: StageMap = {};
  const used = new Set<string>();
  for (const key of STAGE_KEYS) {
    for (const re of GUESS[key]) {
      const hit = stages.find((s) => re.test(s.name) && !used.has(s.id));
      if (hit) {
        map[key] = hit.id;
        used.add(hit.id);
        break;
      }
    }
  }
  if (!map.new && stages[0]) map.new = stages[0].id;
  return map;
}
