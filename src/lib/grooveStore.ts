/**
 * grooveStore.ts — persistence for saved grooves (Groove Permutations mode).
 *
 * Mirrors the Quickmark store in `practiceLog.ts`: a flat localStorage list with
 * get/set + add/rename/delete, and a `grooves-changed` event so any open panel
 * re-syncs.  A saved groove keeps the full cycle + the per-point voice
 * placements so it re-renders and re-edits exactly as saved.
 */

import { lsGet, lsSet } from "@/lib/storage";
import type { GrooveCycle, PointVoices } from "@/lib/grooveCycle";

export interface SavedGroove {
  id: string;
  label: string;
  cycle: GrooveCycle;
  pointVoices: PointVoices[];
  matchName?: string;
  timestamp: number;
}

const GROOVE_KEY = "lt_drum_grooves";

export function getGrooves(): SavedGroove[] {
  return lsGet<SavedGroove[]>(GROOVE_KEY, []);
}
export function setGrooves(gs: SavedGroove[]): void {
  lsSet(GROOVE_KEY, gs);
  window.dispatchEvent(new Event("grooves-changed"));
}

function freshId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addGroove(
  cycle: GrooveCycle,
  pointVoices: PointVoices[],
  opts: { label?: string; matchName?: string } = {},
): SavedGroove {
  const sub = cycle.points[0]?.subPulses ?? 0;
  const uniform = cycle.points.every(p => p.subPulses === sub);
  const shape = uniform ? `${cycle.points.length}×${sub}` : cycle.points.map(p => p.subPulses).join("+");
  const groove: SavedGroove = {
    id: freshId(),
    label: opts.label ?? `${shape}${opts.matchName ? ` · ${opts.matchName}` : ""}`,
    cycle: JSON.parse(JSON.stringify(cycle)),
    pointVoices: JSON.parse(JSON.stringify(pointVoices)),
    matchName: opts.matchName,
    timestamp: Date.now(),
  };
  setGrooves([groove, ...getGrooves()]);
  return groove;
}

export function deleteGroove(id: string): void {
  setGrooves(getGrooves().filter(g => g.id !== id));
}
export function renameGroove(id: string, label: string): void {
  setGrooves(getGrooves().map(g => (g.id === id ? { ...g, label } : g)));
}
