// Remembers the page a signed-out visitor asked for, so sign-in can land them back on it.
const KEY = "hso:returnTo";

export function saveReturnTo(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path === "/" || path.startsWith("/login")) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* storage blocked */
  }
}

export function peekReturnTo() {
  try {
    const p = sessionStorage.getItem(KEY);
    return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
