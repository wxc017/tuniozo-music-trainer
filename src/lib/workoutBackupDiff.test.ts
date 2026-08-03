import { describe, it, expect, vi, beforeEach } from "vitest";
import { zipSync, strToU8 } from "fflate";
import type { Workout } from "./workoutTypes";

// The diff reads the live log + video store. Mock both so each case states its
// own "what's on this device" precisely.
const local = {
  workouts: [] as Workout[],
  templates: [] as any[],
  exercises: [] as any[],
  videoIds: [] as string[],
  prefs: { unit: "kg" } as any,
};
const writes = { upsert: [] as Workout[], put: [] as string[], prefs: [] as any[], exercises: [] as any[] };

vi.mock("./workoutStore", () => ({
  getWorkouts: () => local.workouts,
  getTemplates: () => local.templates,
  getCustomExercises: () => local.exercises,
  getPrefs: () => local.prefs,
  referencedVideoIds: () => new Set<string>(),
  upsertWorkout: (w: Workout) => { writes.upsert.push(w); },
  saveTemplate: () => {},
  saveCustomExercise: (name: string) => { writes.exercises.push(name); },
  setPrefs: (p: any) => { writes.prefs.push(p); },
}));
vi.mock("./workoutVideoDb", () => ({
  getVideo: async () => null,
  putVideo: async (v: { id: string }) => { writes.put.push(v.id); },
  allVideoIds: async () => local.videoIds,
}));

const { readBackupFile, diffBackup, applyBackupDiff } = await import("./workoutBackup");

function wk(id: string, title: string, sets: number = 1): Workout {
  return {
    id, date: "2026-08-01", startedAt: 1000, title,
    exercises: [{ id: `e_${id}`, name: "Ring Caruso", mode: "reps", sets: Array.from({ length: sets }, (_, i) => ({ id: `s${i}`, reps: 5 })) }],
  } as Workout;
}

function backupZip(opts: { workouts?: Workout[]; videos?: { id: string }[]; prefs?: any }): File {
  const videos = (opts.videos ?? []).map(v => ({ id: v.id, file: `videos/${v.id}.webm`, mime: "video/webm", durationSec: 3 }));
  const files: Record<string, Uint8Array> = {};
  for (const v of videos) files[v.file] = new Uint8Array([1, 2, 3]);
  files["workout-log.json"] = strToU8(JSON.stringify({
    type: "tunizo-workout-backup", version: 1, exported: "2026-08-01T00:00:00Z",
    workouts: opts.workouts ?? [], templates: [], customExercises: [],
    prefs: opts.prefs ?? local.prefs, videos,
  }));
  return new File([zipSync(files, { level: 0 })], "b.zip", { type: "application/zip" });
}

const load = async (f: File) => { const p = await readBackupFile(f); return { p, d: await diffBackup(p) }; };

beforeEach(() => {
  local.workouts = []; local.templates = []; local.exercises = []; local.videoIds = []; local.prefs = { unit: "kg" };
  writes.upsert = []; writes.put = []; writes.prefs = []; writes.exercises = [];
});

describe("backup diff", () => {
  it("classifies added / same / changed by id", async () => {
    local.workouts = [wk("a", "Pull day"), wk("b", "Push day")];
    // 'a' identical, 'b' edited here since the backup, 'c' only in the backup.
    const { d } = await load(backupZip({ workouts: [wk("a", "Pull day"), wk("b", "Push day OLD"), wk("c", "Legs")] }));

    expect(d.workouts.same).toBe(1);
    expect(d.workouts.added.map(w => w.id)).toEqual(["c"]);
    expect(d.workouts.changed.map(w => w.id)).toEqual(["b"]);
    expect(d.empty).toBe(false);
  });

  it("reports nothing to do when the backup matches the device", async () => {
    local.workouts = [wk("a", "Pull day")];
    local.videoIds = ["v1"];
    const { d } = await load(backupZip({ workouts: [wk("a", "Pull day")], videos: [{ id: "v1" }] }));
    expect(d.empty).toBe(true);
    expect(d.workouts.same).toBe(1);
    expect(d.videos.same).toBe(1);
  });

  it("is insensitive to key order, so a re-serialized record is not 'changed'", async () => {
    const reordered = JSON.parse(JSON.stringify(wk("a", "Pull day")));
    const flipped = { exercises: reordered.exercises, title: reordered.title, startedAt: reordered.startedAt, date: reordered.date, id: reordered.id };
    local.workouts = [flipped as Workout];
    const { d } = await load(backupZip({ workouts: [wk("a", "Pull day")] }));
    expect(d.workouts.changed).toHaveLength(0);
    expect(d.workouts.same).toBe(1);
  });

  it("only pulls video blobs that aren't already on the device", async () => {
    local.videoIds = ["v1", "v2"];
    const { p, d } = await load(backupZip({ videos: [{ id: "v1" }, { id: "v2" }, { id: "v3" }] }));
    expect(d.videos.added).toEqual(["v3"]);
    expect(d.videos.same).toBe(2);

    await applyBackupDiff(p, d);
    expect(writes.put).toEqual(["v3"]);      // v1/v2 never rewritten
  });
});

describe("applying a diff", () => {
  it("additive by default — a workout edited since the backup is left alone", async () => {
    local.workouts = [wk("b", "Push day EDITED TODAY", 5)];
    const { p, d } = await load(backupZip({ workouts: [wk("b", "Push day", 1), wk("c", "Legs")] }));

    const r = await applyBackupDiff(p, d);
    expect(writes.upsert.map(w => w.id)).toEqual(["c"]);   // 'b' untouched
    expect(r.workouts).toBe(1);
  });

  it("overwrites changed records only when explicitly asked", async () => {
    local.workouts = [wk("b", "Push day EDITED TODAY", 5)];
    const { p, d } = await load(backupZip({ workouts: [wk("b", "Push day", 1), wk("c", "Legs")] }));

    const r = await applyBackupDiff(p, d, { includeChanged: true });
    expect(writes.upsert.map(w => w.id).sort()).toEqual(["b", "c"]);
    expect(writes.upsert.find(w => w.id === "b")!.title).toBe("Push day");
    expect(r.workouts).toBe(2);
  });

  it("never resets prefs on an additive restore", async () => {
    local.prefs = { unit: "kg" };
    const { p, d } = await load(backupZip({ prefs: { unit: "lb" } }));
    expect(d.prefsDiffer).toBe(true);

    await applyBackupDiff(p, d);
    expect(writes.prefs).toHaveLength(0);

    await applyBackupDiff(p, d, { includeChanged: true });
    expect(writes.prefs).toEqual([{ unit: "lb" }]);
  });

  it("restoring the same backup twice writes nothing the second time", async () => {
    const zip = backupZip({ workouts: [wk("c", "Legs")], videos: [{ id: "v9" }] });

    const first = await load(zip);
    await applyBackupDiff(first.p, first.d);
    expect(writes.upsert).toHaveLength(1);
    expect(writes.put).toEqual(["v9"]);

    // Simulate the device now holding what was just restored.
    local.workouts = [wk("c", "Legs")];
    local.videoIds = ["v9"];
    writes.upsert = []; writes.put = [];

    const second = await load(zip);
    expect(second.d.empty).toBe(true);
    await applyBackupDiff(second.p, second.d);
    expect(writes.upsert).toHaveLength(0);
    expect(writes.put).toHaveLength(0);
  });
});
