// Reviewed merge for Google Drive sync.
//
// The old restore blindly overwrote localStorage with the incoming payload, so
// loading a device that happened to have fewer items silently DELETED whatever
// only existed locally (e.g. sol-fa scores the phone never had). This module
// diffs the incoming payload against local data at the ITEM level for
// collections (arrays of objects with an `id`) and at the value level for
// everything else, so the user can see and choose exactly what to add, change,
// or delete — nothing is removed without consent.

import { shouldSyncEntry } from "./storage";

export type ChangeKind = "add" | "update" | "remove";

export interface ItemChange {
  key: string;       // localStorage key holding the collection
  id: string;        // item id within that collection
  kind: ChangeKind;  // add = only on other device, update = differs, remove = only here
  label: string;     // human-friendly item name
}

export interface ValueChange {
  key: string;              // opaque (non-collection) localStorage key
  kind: "add" | "update";   // add = missing locally, update = differs
  label: string;            // human-friendly key name
}

export interface SyncDiff {
  items: ItemChange[];
  values: ValueChange[];
}

// Friendly names for the keys most people care about; others fall back to a
// de-prefixed, spaced version of the raw key.
const KEY_LABELS: Record<string, string> = {
  lt_note_entry_projects: "Scores (Sol-fa / Sheet / Drum)",
  lt_note_entry_folders: "Score folders",
  lt_workout_log: "Workout log",
  lt_workout_templates: "Workout templates",
  lt_workout_custom_exercises: "Workout exercises",
  lt_workout_prefs: "Workout settings",
  lt_chord_charts: "Chord charts",
  lt_practice_log: "Practice log",
  lt_drum_log: "Drum log",
  lt_drum_grooves: "Drum grooves",
  lt_presets: "Presets",
};

// The cryptic value keys are `lt_<tool>_<setting>`; map the tool prefix to the
// feature it belongs to so a row reads "Chords · voicing patterns" instead of
// the raw "crd vpatterns v3". Unknown prefixes just get a cleaned name.
const CATEGORY_LABELS: Record<string, string> = {
  crd: "Chords", trx: "Transcriptions", tx: "Backing track", sp: "Split permutations",
  beta: "Experimental", lattice: "Lattice", scalar: "Scalar", phrase: "Phrase lab",
  spectrum: "Spectrum", rhy: "Rhythm", cons: "Consonance", dc: "Drone continuum",
  interplay: "Interplay", app: "App", metronome: "Metronome", timer: "Timer",
  node: "Mixer", ra: "Rhythm drill", fiu: "Subdivision", scalarViz: "Scalar",
};

export function keyLabel(k: string): string {
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  const rest = k.replace(/^lt_/, "");
  const m = rest.match(/^([a-z]+)_(.+)$/);
  if (m && CATEGORY_LABELS[m[1]]) {
    return `${CATEGORY_LABELS[m[1]]} · ${m[2].replace(/_/g, " ").replace(/\bv\d+$/, "").trim()}`;
  }
  return rest.replace(/_/g, " ");
}

/** Broad feature name for a key (used to group the settings review). */
export function keyCategory(k: string): string {
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  const m = k.replace(/^lt_/, "").match(/^([a-z]+)_/);
  return (m && CATEGORY_LABELS[m[1]]) || "Other settings";
}

// Never merge these even though they carry the lt_ prefix (device-local).
const SKIP_KEYS = new Set(["lt_gdrive_token", "lt_workout_drive_folder"]);

type Item = Record<string, unknown> & { id: unknown };

/** Parse a stored value as a collection: a JSON array whose every element is an
 *  object carrying an `id`. Empty arrays qualify. Anything else → null. */
function parseCollection(val: string | null | undefined): Item[] | null {
  if (val == null) return null;
  try {
    const p = JSON.parse(val);
    if (Array.isArray(p) && p.every(e => e && typeof e === "object" && "id" in e)) return p as Item[];
    return null;
  } catch { return null; }
}

function itemLabel(it: Item): string {
  const o = it as Record<string, unknown>;
  const cand = o.title || o.name || o.label || o.date;
  if (typeof cand === "string" && cand.trim()) return cand;
  if (typeof o.createdAt === "number") { try { return new Date(o.createdAt).toLocaleDateString(); } catch { /* */ } }
  return String(it.id);
}

/** Compare the incoming sync payload against current localStorage. */
export function computeSyncDiff(remoteJson: string): SyncDiff {
  const items: ItemChange[] = [];
  const values: ValueChange[] = [];
  let data: Record<string, string> = {};
  try { data = (JSON.parse(remoteJson)?.data ?? {}) as Record<string, string>; }
  catch { return { items, values }; }

  for (const [key, remoteVal] of Object.entries(data)) {
    // Skip anything not worth syncing (transient tool/default state), so even an
    // older, fat backup no longer surfaces a wall of settings churn.
    if (SKIP_KEYS.has(key) || !shouldSyncEntry(key, remoteVal)) continue;
    const localVal = localStorage.getItem(key);
    const remoteArr = parseCollection(remoteVal);
    const localArr = parseCollection(localVal);

    if (remoteArr && localArr) {
      const localById = new Map(localArr.map(i => [String(i.id), i]));
      const remoteById = new Map(remoteArr.map(i => [String(i.id), i]));
      for (const [id, rit] of remoteById) {
        const lit = localById.get(id);
        if (!lit) items.push({ key, id, kind: "add", label: itemLabel(rit) });
        else if (JSON.stringify(lit) !== JSON.stringify(rit)) items.push({ key, id, kind: "update", label: itemLabel(rit) });
      }
      for (const [id, lit] of localById) {
        if (!remoteById.has(id)) items.push({ key, id, kind: "remove", label: itemLabel(lit) });
      }
    } else {
      if (localVal == null) values.push({ key, kind: "add", label: keyLabel(key) });
      else if (localVal !== remoteVal) values.push({ key, kind: "update", label: keyLabel(key) });
    }
  }
  return { items, values };
}

export function itemChangeId(c: ItemChange): string { return `${c.key}::${c.id}`; }
export function valueChangeId(c: ValueChange): string { return `val::${c.key}`; }

/** Apply only the changes whose ids are in `applied`, merging into localStorage.
 *  Local-only items are preserved unless their `remove` change is applied. */
export function applySyncSelection(remoteJson: string, diff: SyncDiff, applied: Set<string>): void {
  let data: Record<string, string> = {};
  try { data = (JSON.parse(remoteJson)?.data ?? {}) as Record<string, string>; }
  catch { return; }

  const byKey = new Map<string, ItemChange[]>();
  for (const c of diff.items) {
    const arr = byKey.get(c.key) ?? [];
    arr.push(c);
    byKey.set(c.key, arr);
  }

  for (const [key, changes] of byKey) {
    const remoteById = new Map((parseCollection(data[key]) ?? []).map(i => [String(i.id), i]));
    const localArr = parseCollection(localStorage.getItem(key)) ?? [];
    const changeById = new Map(changes.map(c => [c.id, c]));

    const final: Item[] = [];
    for (const lit of localArr) {
      const id = String(lit.id);
      const c = changeById.get(id);
      if (c && applied.has(itemChangeId(c))) {
        if (c.kind === "remove") continue;                          // drop local-only item
        if (c.kind === "update") { final.push(remoteById.get(id)!); continue; } // take remote
      }
      final.push(lit);                                              // keep local
    }
    for (const c of changes) {
      if (c.kind === "add" && applied.has(itemChangeId(c))) final.push(remoteById.get(c.id)!);
    }
    localStorage.setItem(key, JSON.stringify(final));
  }

  for (const c of diff.values) {
    if (applied.has(valueChangeId(c))) localStorage.setItem(c.key, data[c.key]);
  }
}

/** Automatic, purely-additive merge for app-open: brings over items another
 *  device created, but NEVER changes or deletes anything local. Returns how many
 *  items were added (0 → nothing to do). */
export function autoMergeAdditive(remoteJson: string): number {
  const diff = computeSyncDiff(remoteJson);
  const applied = new Set<string>();
  for (const c of diff.items) if (c.kind === "add") applied.add(itemChangeId(c));
  if (applied.size) applySyncSelection(remoteJson, diff, applied);
  return applied.size;
}
