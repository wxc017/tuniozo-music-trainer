// Export ONE workout session as a single self-contained .html file — every set's
// stats plus its video embedded inline as a data: URI, so it opens and plays in
// any browser with no app, no internet, no separate files. Ideal for sharing a
// session (with clips) to someone. Videos resolve from IndexedDB or, if
// offloaded, streamed from Drive first.

import { getClipUrl } from "./workoutDrive";
import { localToday } from "./storage";
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

function setLine(s: WorkoutSet): string {
  const parts: string[] = [];
  if (s.weight != null) parts.push(`${s.weight} kg`);
  if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.holdSec != null) parts.push(`${s.holdSec}s hold`);
  if (s.rpe != null) parts.push(`RPE ${s.rpe}`);
  return parts.join(" · ") || "—";
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0d0d0d;color:#e8e8e8;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px;max-width:820px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}
.date{color:#888;font-size:13px;margin-bottom:24px}
section{border:1px solid #222;border-radius:12px;padding:16px;margin-bottom:16px;background:#131313}
h2{font-size:16px;margin:0 0 12px;color:#9db}
.set{border-top:1px solid #1e1e1e;padding:12px 0}
.set:first-of-type{border-top:none}
.set-h{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#777}
.set-d{margin:2px 0 8px;color:#ddd}
video{width:100%;max-height:70vh;border-radius:8px;background:#000}
footer{color:#555;font-size:12px;text-align:center;margin-top:24px}
`;

/** Build the self-contained HTML string for a session. */
export async function buildWorkoutHtml(workout: Workout): Promise<{ html: string; videoCount: number }> {
  let videoCount = 0;
  const sections: string[] = [];
  for (const ex of workout.exercises as LoggedExercise[]) {
    const rows: string[] = [];
    for (let i = 0; i < ex.sets.length; i++) {
      const s = ex.sets[i];
      const uri = (s.videoId || s.driveFileId) ? await clipDataUri(s) : "";
      const vid = uri ? (videoCount++, `<video controls playsinline preload="metadata" src="${uri}"></video>`) : "";
      rows.push(`<div class="set"><div class="set-h">Set ${i + 1}</div><div class="set-d">${esc(setLine(s))}</div>${vid}</div>`);
    }
    sections.push(`<section><h2>${esc(ex.name)}</h2>${rows.join("")}</section>`);
  }
  const when = (() => { try { return new Date(workout.startedAt).toLocaleString(); } catch { return workout.date; } })();
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(workout.title)}</title><style>${STYLE}</style></head><body>` +
    `<h1>${esc(workout.title)}</h1><div class="date">${esc(when)}</div>` +
    sections.join("") +
    `<footer>Exported from Tunizo Workout Log</footer></body></html>`;
  return { html, videoCount };
}

/** Build + hand off the session HTML (native share where available, else download). */
export async function exportWorkoutSession(workout: Workout): Promise<{ shared: boolean; videoCount: number }> {
  const { html, videoCount } = await buildWorkoutHtml(workout);
  const safeTitle = (workout.title || "workout").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workout";
  const filename = `${safeTitle}-${workout.date || localToday()}.html`;
  const blob = new Blob([html], { type: "text/html" });
  const nav = navigator as unknown as { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
  const file = new File([blob], filename, { type: "text/html" });

  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
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
