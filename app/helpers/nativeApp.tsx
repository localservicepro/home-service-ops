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
  if (pushBuilt()) listenForPush();
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

// ---------- Push notifications (Firebase via @capacitor/push-notifications) ----------

const PUSH_TOKEN_KEY = "hso-push-token";
const PUSH_ASKED_KEY = "hso-push-asked";

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** Opens an in-app path without reloading (React Router listens for popstate). */
function goTo(path: string) {
  if (!path.startsWith("/")) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

let pushListeners: Promise<void> | null = null;

/** Listeners for taps and foreground alerts; set up at launch so a tap that opened the app is caught. */
function listenForPush() {
  if (pushListeners) return pushListeners;
  pushListeners = (async () => {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.createChannel({ id: "alerts", name: "Alerts", description: "New enquiries, quote replies, payments and jobs", importance: 4, visibility: 1, vibration: true }).catch(() => {});
    await PushNotifications.addListener("registration", async ({ value }) => {
      writeLocal(PUSH_TOKEN_KEY, value);
      const { postPushRegister } = await import("../endpoints/push/register_POST.schema");
      await postPushRegister({ token: value, platform: "android" }).catch(() => {});
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const url = (notification.data as { url?: string } | undefined)?.url;
      if (url) goTo(url);
    });
    // Android doesn't show notifications while the app is open, so show them as a toast.
    await PushNotifications.addListener("pushNotificationReceived", (n) => {
      const url = (n.data as { url?: string } | undefined)?.url;
      toast(n.title || "Home Service Ops", {
        description: n.body,
        duration: 8000,
        ...(url ? { action: { label: "Open", onClick: () => goTo(url) } } : {}),
      });
    });
  })().catch(() => {});
  return pushListeners;
}

/** This app build includes Firebase (see capacitor.config.ts). */
const pushBuilt = () => /HomeServiceOpsPush/.test(navigator.userAgent);

export async function pushPermission(): Promise<PushPermission> {
  if (!isNativeApp() || !pushBuilt()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { receive } = await PushNotifications.checkPermissions();
    return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
  } catch {
    return "unsupported";
  }
}

/**
 * Registers this phone for alerts once someone is signed in. Asks for permission the first time
 * (or whenever `ask` is set, e.g. from the Turn on button); otherwise only refreshes the token.
 */
export async function enablePush(opts: { ask?: boolean } = {}): Promise<PushPermission> {
  if (!isNativeApp() || !pushBuilt()) return "unsupported";
  try {
    await listenForPush();
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await pushPermission();
    if (perm === "prompt" && (opts.ask || !readLocal(PUSH_ASKED_KEY))) {
      writeLocal(PUSH_ASKED_KEY, "1");
      const r = await PushNotifications.requestPermissions();
      perm = r.receive === "granted" ? "granted" : r.receive === "denied" ? "denied" : "prompt";
    }
    if (perm === "granted") await PushNotifications.register();
    return perm;
  } catch {
    return "unsupported";
  }
}

/** On sign-out: stop alerts for the person leaving this phone. */
export async function disablePushForSignOut() {
  const token = readLocal(PUSH_TOKEN_KEY);
  if (!isNativeApp() || !token) return;
  try {
    const { postPushUnregister } = await import("../endpoints/push/unregister_POST.schema");
    await Promise.race([postPushUnregister({ token }), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    /* the server drops it when someone else registers this phone */
  }
}
