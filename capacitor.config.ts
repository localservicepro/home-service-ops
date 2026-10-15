import { existsSync } from "node:fs";
import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a shell around the live site, so every web deploy reaches the app straight
// away and Play Store releases are only needed for native changes (icon, permissions, plugins).
// native/www only holds the page shown when the phone is offline.
const APP_URL = process.env.CAP_SERVER_URL || "https://home.localservicepro.com.au";
// Push needs Firebase's android/app/google-services.json (CI writes it from a secret). The web
// code only turns push on when the user agent says the build has it, since registering
// without Firebase crashes the app.
const PUSH = existsSync("android/app/google-services.json"); // cap commands run from the repo root

const config: CapacitorConfig = {
  appId: "au.com.localservicepro.home",
  appName: "Home Service Ops",
  webDir: "native/www",
  server: {
    url: APP_URL,
    errorPath: "offline.html",
    // Supabase (sign-in, photo storage) stays inside the app; every other site opens in the browser.
    allowNavigation: ["gcuzmuztikisxsmkgtbi.supabase.co"],
  },
  android: {
    backgroundColor: "#08172B",
    appendUserAgent: PUSH ? "HomeServiceOpsApp HomeServiceOpsPush" : "HomeServiceOpsApp",
  },
  plugins: {
    // Pages get padded clear of the system bars (index.html switches the app to viewport-fit=contain);
    // the navy window shows behind them, so the bar icons are light.
    SystemBars: { insetsHandling: "css", style: "DARK" },
  },
};

export default config;
