// Rest-timer notifications. On Android, notifications MUST come from a service
// worker (ServiceWorkerRegistration.showNotification) — `new Notification()`
// throws. We register a minimal SW (public/sw.js) and fall back to the plain
// Notification constructor on desktop.
//
// Platform reality: mobile browsers throttle/suspend background timers, so a
// completion notification is reliable for short rests but not guaranteed once
// the tab is fully frozen (typically after several minutes hidden).

let swReg: ServiceWorkerRegistration | null = null;

export async function registerRestSW(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try { swReg = await navigator.serviceWorker.register("sw.js"); } catch { /* ignore */ }
}

/** Request notification permission. Call from a user gesture (e.g. the ⏱ tap). */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try { return (await Notification.requestPermission()) === "granted"; } catch { return false; }
}

async function showRestDone(): Promise<void> {
  // If the app is on-screen, the in-app timer + beep already cover it.
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const title = "Rest complete 💪";
  const opts: NotificationOptions = { body: "Back to your set.", tag: "wl-rest", requireInteraction: true };
  try {
    const reg = swReg ?? (("serviceWorker" in navigator) ? await navigator.serviceWorker.ready : null);
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fall through to constructor */ }
  try { new Notification(title, opts); } catch { /* unsupported on this platform */ }
}

/** Fire a rest-complete notification `seconds` from now. Returns a cancel fn. */
export function scheduleRestNotification(seconds: number): () => void {
  const id = window.setTimeout(() => { void showRestDone(); }, Math.max(0, seconds * 1000));
  return () => window.clearTimeout(id);
}
