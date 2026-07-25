// ── Personal spectrum band boundaries ───────────────────────────────
// The small / middle / large split of each interval region is personal.  This
// module lets the user move those two internal boundaries and persists them,
// applying the edits directly onto the shared REGIONS objects so EVERY consumer
// that reads `region.subs` (generation via regionBand, solfège via vowelIndex,
// the spectrum charts) follows the personal split with no extra wiring.

import { REGIONS } from "./intervalSpectrum";

const KEY = "spectrum_band_overrides_v1";

// Only regions split into exactly three sub-bands have editable boundaries.
const editable = REGIONS.filter(r => r.subs && r.subs.length === 3);

export interface EditableRegion { name: string; lo: number; hi: number; jis?: string[]; }
export const EDITABLE_REGIONS: EditableRegion[] = editable.map(r => ({ name: r.name, lo: r.lo, hi: r.hi, jis: r.jis }));

// Snapshot the shipped defaults BEFORE any override is applied (for reset).
const DEFAULTS: Record<string, [number, number]> = {};
for (const r of editable) DEFAULTS[r.name] = [r.subs![0].hi, r.subs![1].hi];

function load(): Record<string, [number, number]> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function persist(o: Record<string, [number, number]>) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode / quota */ }
}

// Write the two boundaries (small|middle = b1, middle|large = b2) onto the region.
function apply(name: string, b1: number, b2: number) {
  const r = editable.find(x => x.name === name);
  if (!r || !r.subs) return;
  r.subs[0].hi = b1; r.subs[1].lo = b1;
  r.subs[1].hi = b2; r.subs[2].lo = b2;
}

// Apply any saved overrides at import time (before REGIONS is consumed).
for (const [name, bs] of Object.entries(load())) {
  if (Array.isArray(bs) && bs.length === 2) apply(name, bs[0], bs[1]);
}

export function getBoundaries(name: string): [number, number] {
  const r = editable.find(x => x.name === name)!;
  return [r.subs![0].hi, r.subs![1].hi];
}
export function getDefault(name: string): [number, number] { return DEFAULTS[name]; }
export function isModified(name: string): boolean {
  const [b1, b2] = getBoundaries(name), [d1, d2] = DEFAULTS[name];
  return b1 !== d1 || b2 !== d2;
}

/** Move a boundary (which: 0 = small|middle, 1 = middle|large) to `cents`,
 *  keeping the ordering lo < b1 < b2 < hi, then persist. */
export function setBoundary(name: string, which: 0 | 1, cents: number) {
  const r = editable.find(x => x.name === name);
  if (!r) return;
  let [b1, b2] = getBoundaries(name);
  const v = Math.round(cents);
  if (which === 0) b1 = Math.max(r.lo + 1, Math.min(v, b2 - 1));
  else b2 = Math.max(b1 + 1, Math.min(v, r.hi - 1));
  apply(name, b1, b2);
  const o = load(); o[name] = [b1, b2]; persist(o);
}

export function resetRegion(name: string) {
  const [b1, b2] = DEFAULTS[name];
  apply(name, b1, b2);
  const o = load(); delete o[name]; persist(o);
}
export function resetAll() {
  for (const [name, [b1, b2]] of Object.entries(DEFAULTS)) apply(name, b1, b2);
  persist({});
}

/** Cents value of a JI ratio string like "5/4" (for reference ticks). */
export function ratioCents(ratio: string): number | null {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(ratio.trim());
  if (!m) return null;
  return 1200 * Math.log2(Number(m[1]) / Number(m[2]));
}
