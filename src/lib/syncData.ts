import { shouldSyncEntry } from "./storage";

// Build sync payload — same format as "Export Everything"
export function buildSyncPayload(): string {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const val = localStorage.getItem(key)!;
    if (shouldSyncEntry(key, val)) data[key] = val;
  }
  return JSON.stringify({ version: 1, exported: new Date().toISOString(), data });
}

// Restore from sync payload — same format as "Import Everything"
export function restoreFromSyncPayload(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json);
    if (!parsed?.data || typeof parsed.data !== "object") {
      return { ok: false, error: "Invalid sync data." };
    }
    const entries = Object.entries(parsed.data) as [string, string][];
    const valid = entries.filter(([k, v]) => shouldSyncEntry(k, v));
    if (!valid.length) return { ok: false, error: "No data found." };
    valid.forEach(([k, v]) => localStorage.setItem(k, v));
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not parse sync data." };
  }
}
