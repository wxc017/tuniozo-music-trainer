// Export ONE workout session as a single self-contained .html file — every set's
// stats plus its video embedded inline as a data: URI, so it opens and plays in
// any browser with no app, no internet, no separate files. Ideal for sharing a
// session (with clips) to someone. Videos resolve from IndexedDB or, if
// offloaded, streamed from Drive first.

import { getClipUrl } from "./workoutDrive";
import { getPrefs } from "./workoutStore";
import { localToday } from "./storage";
import { TRACKING_MODES } from "./workoutTypes";
import type { Workout, WorkoutSet, LoggedExercise } from "./workoutTypes";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Base64 data URI for a set's clip, or "" if it can't be resolved. */
async function clipDataUri(s: WorkoutSet): Promise<string> {
  try {
    const url = await getClipUrl({ videoId: s.videoId, driveFileId: s.driveFileId });
    if (!url) return "";
    const blob = await (await fetch(url)).blob();
    return await blobToDataUrl(blob);
  } catch { return ""; }
}

/** Stat pills for a set (weight/reps/hold/RPE), unit-aware. */
function statPills(s: WorkoutSet, unit: string): string {
  const pills: string[] = [];
  if (s.weight != null && s.weight !== 0) {
    const sign = s.weight > 0 ? "+" : "";
    pills.push(`<span class="pill">${sign}${esc(s.weight)} ${esc(unit)}${s.weight < 0 ? " assist" : ""}</span>`);
  }
  if (s.reps != null) pills.push(`<span class="pill">${esc(s.reps)}<span class="u">reps</span></span>`);
  if (s.holdSec != null) pills.push(`<span class="pill">${esc(s.holdSec)}<span class="u">s hold</span></span>`);
  if (s.rpe != null) pills.push(`<span class="pill pill--rpe">RPE ${esc(s.rpe)}</span>`);
  return pills.join("") || `<span class="pill pill--empty">—</span>`;
}

/** "Form ★★★☆☆" for a 1–5 form rating, or "" if unrated. */
function formStars(form?: number): string {
  if (form == null) return "";
  const stars = [1, 2, 3, 4, 5].map(n => n <= form ? "★" : "☆").join("");
  return `<span class="form" title="Form ${esc(form)}/5"><span class="form-lbl">Form</span> ${stars}</span>`;
}

// Design system lifted from the app's Workout Log: warm gold accent, serif
// headings, mono labels/numbers, hover-lift cards on a near-black shell.
const STYLE = `
:root{color-scheme:dark;
  --bg:#0d0d0f;--panel:#16171d;--panel2:#1c1d25;--line:#2a2c36;--text:#ececf0;
  --muted:#9a9cab;--faint:#6b6e7a;--gold:#d7ac52;--gold-ink:#eaca86;--good:#7bd88f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
  padding:28px 20px 40px}
.wrap{max-width:760px;margin:0 auto}
.serif{font-family:"Iowan Old Style",Palatino,"Palatino Linotype",Georgia,serif}
.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.eyebrow{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--gold);margin:0 0 6px}
h1{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:28px;line-height:1.15;margin:0 0 6px;font-weight:600}
.date{font-family:ui-monospace,Menlo,Consolas,monospace;color:var(--faint);font-size:12px;margin:0 0 16px}
.summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 26px}
.stat{flex:1;min-width:96px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-align:center}
.stat b{font-family:ui-monospace,Menlo,monospace;font-size:22px;font-weight:700;display:block}
.stat span{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
section{border:1px solid var(--line);border-radius:16px;padding:4px 16px 8px;margin:0 0 16px;
  background:linear-gradient(180deg,var(--panel),var(--panel2))}
.ex-h{display:flex;align-items:baseline;gap:10px;padding:14px 0 6px;border-bottom:1px solid var(--line)}
h2{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:19px;margin:0;font-weight:600}
.mode{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--gold-ink);border:1px solid var(--line);border-radius:999px;padding:3px 9px}
.set{padding:12px 0;border-top:1px solid rgba(255,255,255,.05)}
.set:first-of-type{border-top:none}
.set-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.n{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.06em;color:var(--faint);
  border:1px solid var(--line);border-radius:999px;padding:2px 9px;min-width:44px;text-align:center}
.pill{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--text);
  background:rgba(215,172,82,.10);border:1px solid rgba(215,172,82,.25);border-radius:8px;padding:4px 9px}
.pill .u{color:var(--faint);margin-left:3px;font-size:11px}
.pill--rpe{background:rgba(255,255,255,.04);border-color:var(--line);color:var(--muted)}
.pill--empty{background:none;border:none;color:var(--faint)}
.form{margin-left:auto;color:var(--gold);letter-spacing:2px;font-size:14px}
.note{margin:8px 0 0;color:var(--muted);font-size:13px;font-style:italic;
  border-left:2px solid rgba(215,172,82,.4);padding:2px 0 2px 10px}
video{width:100%;max-height:70vh;border-radius:10px;background:#000;margin-top:10px;display:block}
/* At-a-glance overview — every exercise + its sets, no scrolling */
.overview{border:1px solid var(--line);border-radius:16px;padding:6px 16px 14px;margin:0 0 22px;background:var(--panel)}
.overview>.eyebrow{margin:12px 0 10px}
.ov-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.ov-ex{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--bg)}
.ov-name{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-size:15px;margin:0 0 8px;line-height:1.2}
.ov-sets{display:flex;flex-direction:column;gap:5px}
.ov-set{display:flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
.ov-i{color:var(--faint);min-width:16px}
.ov-v{color:var(--text)}
.ov-f{margin-left:auto;color:var(--gold);letter-spacing:1px;font-size:11px}
.ov-cam{color:var(--gold-ink);font-size:11px}
footer{color:var(--faint);font-size:11px;text-align:center;margin-top:28px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.1em}
footer b{color:var(--gold)}
`;

/** Whether a set carries any logged content (so empty placeholder sets/exercises
 *  are left out of the export). */
function setHasData(s: WorkoutSet): boolean {
  return !!(s.done || s.reps != null || s.holdSec != null || s.weight != null
    || s.rpe != null || s.form != null || s.note || s.videoId || s.driveFileId);
}

/** Ultra-compact one-liner for a set in the top overview. */
function setBrief(s: WorkoutSet, unit: string): string {
  const parts: string[] = [];
  if (s.weight != null && s.weight !== 0) parts.push(`${s.weight > 0 ? "+" : ""}${esc(s.weight)}${esc(unit)}`);
  if (s.reps != null) parts.push(`${esc(s.reps)} reps`);
  if (s.holdSec != null) parts.push(`${esc(s.holdSec)}s`);
  if (s.rpe != null) parts.push(`RPE ${esc(s.rpe)}`);
  return parts.join(" · ") || "—";
}

/** Build the self-contained HTML string for a session. */
export async function buildWorkoutHtml(workout: Workout): Promise<{ html: string; videoCount: number }> {
  const unit = getPrefs().unit;
  // Only exercises that actually have logged sets make it into the export.
  const exercises = (workout.exercises as LoggedExercise[])
    .map(ex => ({ ex, sets: ex.sets.filter(setHasData) }))
    .filter(e => e.sets.length > 0);

  let videoCount = 0;
  let setCount = 0;
  const overviewCards: string[] = [];
  const sections: string[] = [];

  for (const { ex, sets } of exercises) {
    const modeShort = TRACKING_MODES.find(m => m.id === ex.mode)?.short ?? "";

    // top overview (no video, just the numbers so it all fits above the fold)
    const ovSets = sets.map((s, i) => {
      const stars = s.form != null ? `<span class="ov-f"><span class="form-lbl">Form</span> ${[1, 2, 3, 4, 5].map(n => n <= s.form! ? "★" : "☆").join("")}</span>` : "";
      return `<div class="ov-set"><span class="ov-i">${i + 1}</span><span class="ov-v">${esc(setBrief(s, unit))}</span>${stars}</div>`;
    }).join("");
    overviewCards.push(`<div class="ov-ex"><div class="ov-name">${esc(ex.name)}</div><div class="ov-sets">${ovSets}</div></div>`);

    // detailed section (with embedded video)
    const rows: string[] = [];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      setCount++;
      const uri = (s.videoId || s.driveFileId) ? await clipDataUri(s) : "";
      const vid = uri ? (videoCount++, `<video controls playsinline preload="metadata" src="${uri}"></video>`) : "";
      rows.push(
        `<div class="set"><div class="set-top">` +
        `<span class="n">Set ${i + 1}</span>${statPills(s, unit)}${formStars(s.form)}` +
        `</div>${vid}</div>`,
      );
    }
    sections.push(
      `<section><div class="ex-h"><h2>${esc(ex.name)}</h2>` +
      `${modeShort ? `<span class="mode">${esc(modeShort)}</span>` : ""}</div>${rows.join("")}</section>`,
    );
  }

  const when = (() => { try { return new Date(workout.startedAt).toLocaleString(); } catch { return workout.date; } })();
  const clipWord = videoCount === 1 ? "clip" : "clips";
  const exWord = exercises.length === 1 ? "exercise" : "exercises";
  const setWord = setCount === 1 ? "set" : "sets";
  const overview = overviewCards.length
    ? `<div class="overview"><p class="eyebrow">At a glance</p><div class="ov-grid">${overviewCards.join("")}</div></div>`
    : "";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(workout.title)}</title><style>${STYLE}</style></head><body><div class="wrap">` +
    `<p class="eyebrow">Tunizo · Workout Log</p>` +
    `<h1>${esc(workout.title || "Workout")}</h1><p class="date">${esc(when)}</p>` +
    `<div class="summary">` +
    `<div class="stat"><b>${exercises.length}</b><span>${exWord}</span></div>` +
    `<div class="stat"><b>${setCount}</b><span>${setWord}</span></div>` +
    `<div class="stat"><b>${videoCount}</b><span>${clipWord}</span></div>` +
    `</div>` +
    overview +
    sections.join("") +
    `<footer>Exported from <b>Tunizo</b> Workout Log</footer></div></body></html>`;
  return { html, videoCount };
}

/** Build + hand off the session HTML. Defaults to the native share sheet where
 *  available (falling back to a download); pass `{ download: true }` to skip
 *  the share sheet and download the file directly. */
export async function exportWorkoutSession(workout: Workout, opts?: { download?: boolean }): Promise<{ shared: boolean; videoCount: number }> {
  const { html, videoCount } = await buildWorkoutHtml(workout);
  const safeTitle = (workout.title || "workout").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workout";
  const filename = `${safeTitle}-${workout.date || localToday()}.html`;
  const blob = new Blob([html], { type: "text/html" });
  const nav = navigator as unknown as { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
  const file = new File([blob], filename, { type: "text/html" });

  if (!opts?.download && nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title: workout.title }); return { shared: true, videoCount }; }
    catch (err) { if ((err as { name?: string })?.name === "AbortError") return { shared: true, videoCount }; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { shared: false, videoCount };
}
