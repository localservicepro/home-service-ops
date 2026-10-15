import { toast } from "sonner";

// The Play Store app is a Capacitor shell around this same site (see capacitor.config.ts).
// Its plugins are only imported inside the app, so the website never downloads them.

/** Custom URL scheme the app registers; Google sign-in comes back through it. */
export const APP_SCHEME = "au.com.localservicepro.home";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * window.open for connect/checkout pop-ups. The app can't open a second window (and on Android
 * an empty window.open replaces the app's own page), so inside the app this explains where to
 * do it instead and returns null. On the web a blocked pop-up gets the usual message.
 */
export function openPopupWindow(name: string, features: string, label: string): Window | null {
  if (isNativeApp()) {
    toast.info(`Connect ${label} from a web browser`, {
      description: "Sign in at home.localservicepro.com.au on a computer or in your phone's browser. Once connected it works in the app too.",
      duration: 8000,
    });
    return null;
  }
  const popup = window.open("", name, features);
  if (!popup) toast.error(`Your browser blocked the ${label} window. Allow pop-ups for this site and try again.`);
  return popup;
}

/** Opens a page in the system browser (Custom Tab) from inside the app. */
export async function openInBrowser(url: string) {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, toolbarColor: "#08172B" });
}

let started = false;

/** Wires up deep links once, when running inside the app. */
export async function startNativeApp() {
  if (started || !isNativeApp()) return;
  started = true;
  document.documentElement.classList.add("native-app");
  const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
  await App.addListener("appUrlOpen", ({ url }) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    // au.com.localservicepro.home://auth/callback?code=… → finish sign-in in the app's own page,
    // where supabase-js kept the PKCE verifier when sign-in started.
    if (u.protocol === `${APP_SCHEME}:`) {
      Browser.close().catch(() => {});
      const path = `/${u.host}${u.pathname}`.replace(/\/+$/, "") || "/";
      window.location.replace(`${path}${u.search}${u.hash}`);
    }
  });
}
