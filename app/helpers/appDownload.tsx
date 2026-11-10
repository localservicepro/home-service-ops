// Android app download (the APK published by .github/workflows/android.yml; vercel.json
// redirects /android.apk to the "android-app" GitHub release).
export const APK_URL = "/android.apk";
export const DOWNLOAD_PAGE = "/download";

export const isAndroidBrowser = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
export const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
