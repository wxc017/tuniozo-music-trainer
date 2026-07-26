// Lightweight in-app debug log for the Google Drive sign-in / sync flow.
// Surfaced in SettingsModal so issues are diagnosable on a phone where the
// browser console isn't reachable. Ring-buffered; also mirrored to console.

type Listener = (lines: string[]) => void;

const lines: string[] = [];
const listeners = new Set<Listener>();
const MAX = 200;

export function dlog(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  lines.push(`${ts}  ${msg}`);
  if (lines.length > MAX) lines.shift();
  const snapshot = lines.slice();
  listeners.forEach(l => l(snapshot));
  try { console.log("[drive]", msg); } catch { /* ignore */ }
}

export function getDriveLog(): string[] {
  return lines.slice();
}

export function subscribeDriveLog(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function clearDriveLog(): void {
  lines.length = 0;
  listeners.forEach(l => l([]));
}
