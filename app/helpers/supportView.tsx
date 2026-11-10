// Browser-only. "View as customer": Local Service Pro staff open a business's account with their
// own login. The open support session lives in this tab's sessionStorage, so only this tab is in
// support view; apiFetch sends its id in the x-hso-view-as header and the api checks it.

export type SupportView = { id: string; businessId: number; businessName: string; allowChanges: boolean; expiresAt: string };
const KEY = "hso.supportView";

export function getSupportView(): SupportView | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SupportView;
    if (new Date(v.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

/** Enters support view and reloads into the app (a fresh page, so no cached data from the admin). */
export function enterSupportView(v: SupportView) {
  sessionStorage.setItem(KEY, JSON.stringify(v));
  window.location.assign("/");
}

/** Leaves support view and goes back to the customer in the admin. */
export function leaveSupportView(to?: string) {
  const v = getSupportView();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  window.location.assign(to ?? (v ? `/admin?tab=customers&c=${v.businessId}` : "/admin"));
}
