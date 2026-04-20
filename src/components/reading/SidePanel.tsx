import type { TextExtract, NoteEntry, QuestionEntry, ExplorationEntry, PenStroke } from "@/lib/readingWorkflowData";
import { groupByDay } from "@/lib/readingWorkflowData";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

interface Props {
  textExtracts: TextExtract[];
  notes: NoteEntry[];
  questions: QuestionEntry[];
  explorations: ExplorationEntry[];
  onDeleteExtract: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteQuestion: (id: string) => void;
  onDeleteExploration: (id: string) => void;
  onUndoExtract?: (item: TextExtract) => void;
  onUndoNote?: (item: NoteEntry) => void;
  onUndoQuestion?: (item: QuestionEntry) => void;
  onUndoExploration?: (item: ExplorationEntry) => void;
  onJumpToText?: (page: number, text: string) => void;
  onEditNote?: (id: string, note: string) => void;
  onEditQuestion?: (id: string, question: string) => void;
  onEditExploration?: (id: string, exploration: string) => void;
  onNoteToQuestion?: (id: string) => void;
  onNoteToExploration?: (id: string) => void;
  onQuestionToNote?: (id: string) => void;
  onQuestionToExploration?: (id: string) => void;
  onExplorationToNote?: (id: string) => void;
  onExplorationToQuestion?: (id: string) => void;
}

/* ── Confirm Dialog ── */
interface ConfirmState {
  type: "extract" | "note" | "question" | "exploration";
  id: string;
  label: string;
}

function ConfirmDialog({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg p-4 shadow-2xl max-w-xs w-full mx-4">
        <div className="text-sm text-[#ccc] mb-4">Are you sure you want to delete <span className="font-bold text-white">{label}</span>?</div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded bg-[#2a2a2a] text-[#aaa] hover:bg-[#333] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded bg-[#e06060] text-white hover:bg-[#c04040] transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Undo Toast ── */
function UndoToast({ label, onUndo, onDismiss }: { label: string; onUndo: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-4 py-2.5 shadow-2xl flex items-center gap-3">
      <span className="text-xs text-[#aaa]">Deleted <span className="text-white font-medium">{label}</span></span>
      <button
        onClick={onUndo}
        className="px-2.5 py-1 text-xs font-bold rounded bg-[#7173e6] hover:bg-[#5a5cc7] text-white transition-colors"
      >
        Undo
      </button>
    </div>
  );
}

/* ── Stroke Preview ── */
function StrokePreview({ strokes }: { strokes: PenStroke[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * 0.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const maxX = Math.max(...stroke.points.map(p => p.x));
      const maxY = Math.max(...stroke.points.map(p => p.y));
      const sx = maxX > 0 ? canvas.width / (maxX + 10) : 1;
      const sy = maxY > 0 ? canvas.height / (maxY + 10) : 1;
      const s = Math.min(sx, sy, 1);

      ctx.moveTo(stroke.points[0].x * s, stroke.points[0].y * s);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * s, stroke.points[i].y * s);
      }
      ctx.stroke();
    }
  }, [strokes]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={80}
      className="bg-[#0d0d0d] rounded border border-[#1e1e1e] mt-1"
    />
  );
}

/* ── Stroke Preview for Export (renders to offscreen canvas, returns data URL) ── */
function renderStrokesToDataUrl(strokes: PenStroke[], w = 300, h = 120): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, w, h);
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * 0.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const maxX = Math.max(...stroke.points.map(p => p.x));
    const maxY = Math.max(...stroke.points.map(p => p.y));
    const sx = maxX > 0 ? w / (maxX + 10) : 1;
    const sy = maxY > 0 ? h / (maxY + 10) : 1;
    const s = Math.min(sx, sy, 1);
    ctx.moveTo(stroke.points[0].x * s, stroke.points[0].y * s);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * s, stroke.points[i].y * s);
    }
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

/* ── Mini Calendar ── */
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function MiniCalendar({
  datesWithEntries,
  selectedDates,
  onToggleDate,
  accentColor,
}: {
  datesWithEntries: Set<string>;
  selectedDates: Set<string>;
  onToggleDate: (date: string) => void;
  accentColor: string;
}) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`;

  return (
    <div className="px-2 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={prevMonth} className="text-[10px] text-[#666] hover:text-white px-1">&#9664;</button>
        <span className="text-[10px] text-[#888] font-medium">{monthLabel}</span>
        <button onClick={nextMonth} className="text-[10px] text-[#666] hover:text-white px-1">&#9654;</button>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[8px] text-[#555] text-center py-0.5">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const iso = toISO(d);
          const hasEntry = datesWithEntries.has(iso);
          const isSelected = selectedDates.has(iso);
          return (
            <button
              key={iso}
              onClick={() => hasEntry && onToggleDate(iso)}
              disabled={!hasEntry}
              className={`text-[10px] rounded-sm h-5 w-full transition-colors ${
                isSelected
                  ? "text-white font-bold"
                  : hasEntry
                    ? "text-[#aaa] hover:text-white"
                    : "text-[#333] cursor-default"
              }`}
              style={isSelected ? { backgroundColor: accentColor } : hasEntry ? { backgroundColor: "#1e1e1e" } : undefined}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Export helpers ── */
const TAB_LABELS: Record<string, string> = { T: "Texts", N: "Notes", Q: "Questions", E: "Exploration", A: "All" };
const TAB_COLORS: Record<string, string> = { T: "#7173e6", N: "#5a8a5a", Q: "#c06090", E: "#e0a040", A: "#aaa" };

type AnyEntry = TextExtract | NoteEntry | QuestionEntry | ExplorationEntry;

/* ── Tagged entry for combined "All" view ── */
type TaggedEntry =
  | { kind: "T"; entry: TextExtract; idx: number }
  | { kind: "N"; entry: NoteEntry; idx: number }
  | { kind: "Q"; entry: QuestionEntry; idx: number }
  | { kind: "E"; entry: ExplorationEntry; idx: number };

function groupAllByDay(
  texts: TextExtract[],
  notes: NoteEntry[],
  questions: QuestionEntry[],
  explorations: ExplorationEntry[] = [],
): Record<string, TaggedEntry[]> {
  const groups: Record<string, TaggedEntry[]> = {};
  for (const [i, t] of texts.entries()) {
    (groups[t.date] ??= []).push({ kind: "T", entry: t, idx: i });
  }
  for (const [i, n] of notes.entries()) {
    (groups[n.date] ??= []).push({ kind: "N", entry: n, idx: i });
  }
  for (const [i, q] of questions.entries()) {
    (groups[q.date] ??= []).push({ kind: "Q", entry: q, idx: i });
  }
  for (const [i, e] of explorations.entries()) {
    (groups[e.date] ??= []).push({ kind: "E", entry: e, idx: i });
  }
  // Sort entries within each day by timestamp
  for (const day of Object.keys(groups)) {
    groups[day].sort((a, b) => a.entry.timestamp - b.entry.timestamp);
  }
  return groups;
}

function entryToHtmlBlock(entry: AnyEntry, tab: string, idx: number, pageOffset = 0): string {
  const prefix = `${tab}${idx + 1}`;
  const color = TAB_COLORS[tab];
  const parts: string[] = [];

  parts.push(`<div class="entry">`);
  parts.push(`<button class="box-del" contenteditable="false" title="Delete this box">\u00d7</button>`);
  parts.push(`<div class="entry-label" style="color:${color};">${prefix}</div>`);

  // Image
  const imgUrl = "imageDataUrl" in entry ? entry.imageDataUrl : undefined;
  const textForImg = tab === "T" ? (entry as TextExtract).text : (entry as NoteEntry | QuestionEntry).selectedText;
  if (imgUrl || textForImg?.startsWith("data:image/")) {
    parts.push(`<img src="${imgUrl || textForImg}" />`);
  }

  // Text content
  if (tab === "N" && (entry as NoteEntry).note) {
    parts.push(`<div class="entry-text">${escHtml((entry as NoteEntry).note)}</div>`);
  } else if (tab === "Q" && (entry as QuestionEntry).question) {
    parts.push(`<div class="entry-text">${escHtml((entry as QuestionEntry).question)}</div>`);
  } else if (tab === "E" && (entry as ExplorationEntry).exploration) {
    parts.push(`<div class="entry-text">${escHtml((entry as ExplorationEntry).exploration)}</div>`);
  }

  // Pen strokes
  if ("penStrokes" in entry && entry.penStrokes && entry.penStrokes.length > 0) {
    const dataUrl = renderStrokesToDataUrl(entry.penStrokes);
    parts.push(`<img src="${dataUrl}" style="margin-top:6px;border:1px solid #1e1e1e;" />`);
  }

  // Page
  const page = "pageNumber" in entry ? entry.pageNumber : undefined;
  if (page != null) {
    parts.push(`<div class="entry-page">p. ${page + pageOffset}</div>`);
  }

  parts.push(`</div>`);
  return parts.join("");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function entryToMarkdown(entry: AnyEntry, tab: string, idx: number, pageOffset = 0): string {
  const prefix = `**${tab}${idx + 1}**`;
  const lines: string[] = [prefix];
  const page = "pageNumber" in entry ? entry.pageNumber : undefined;

  if (tab === "T") {
    const t = entry as TextExtract;
    if (t.imageDataUrl) lines.push("*(screenshot attached)*");
    if (!t.text.startsWith("data:image/")) lines.push(""); // just screenshot
  } else if (tab === "N") {
    const n = entry as NoteEntry;
    if (n.imageDataUrl) lines.push("*(screenshot attached)*");
    if (n.note) lines.push(n.note);
    if (n.penStrokes?.length) lines.push("*(handwritten annotation)*");
  } else if (tab === "E") {
    const e = entry as ExplorationEntry;
    if (e.imageDataUrl) lines.push("*(screenshot attached)*");
    if (e.exploration) lines.push(e.exploration);
    if (e.penStrokes?.length) lines.push("*(handwritten annotation)*");
  } else {
    const q = entry as QuestionEntry;
    if (q.imageDataUrl) lines.push("*(screenshot attached)*");
    if (q.question) lines.push(q.question);
    if (q.penStrokes?.length) lines.push("*(handwritten annotation)*");
  }

  if (page != null) lines.push(`p. ${page + pageOffset}`);
  return lines.join("\n");
}

function resolveEntries(
  tab: string,
  byDay: Record<string, AnyEntry[] | TaggedEntry[]>,
  days: string[],
): { day: string; items: { entry: AnyEntry; kind: string; idx: number }[] }[] {
  const result: { day: string; items: { entry: AnyEntry; kind: string; idx: number }[] }[] = [];
  for (const day of days) {
    const raw = byDay[day];
    if (!raw?.length) continue;
    const items = (raw as any[]).map((e: any, i: number) => {
      if (tab === "A" && e.kind) {
        const te = e as TaggedEntry;
        return { entry: te.entry as AnyEntry, kind: te.kind, idx: te.idx };
      }
      return { entry: e as AnyEntry, kind: tab, idx: i };
    });
    result.push({ day, items });
  }
  return result;
}

function buildExportHtml(
  tab: string,
  byDay: Record<string, AnyEntry[] | TaggedEntry[]>,
  days: string[],
  pageOffset = 0,
): string {
  const title = TAB_LABELS[tab];
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} Export</title>
<style>
  html, body { background:#0d0d0d; color:#ccc; font-family:system-ui,-apple-system,sans-serif; font-size:13px; line-height:1.6; margin:0; padding:0; min-height:100%; }
  .content { max-width:700px; margin:0 auto; padding:24px; }
  h1 { font-size:18px; color:${TAB_COLORS[tab]}; margin-bottom:20px; }
  .day-header { font-size:10px; color:#555; text-transform:uppercase; letter-spacing:2px; margin:16px 0 8px; }
  .entry { margin-bottom:14px; padding:12px 14px; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; position:relative; }
  .entry:hover { border-color:#444; }
  .entry .box-del { position:absolute; top:8px; right:8px; background:#f44; color:#fff; border:none; border-radius:50%; width:24px; height:24px; font-size:15px; line-height:24px; text-align:center; cursor:pointer; z-index:10; opacity:0.7; }
  .entry .box-del:hover { opacity:1; }
  .entry-label { font-weight:bold; font-size:12px; margin-bottom:8px; }
  .entry-text { font-size:13px; color:#ccc; white-space:pre-wrap; line-height:1.6; }
  .entry-page { font-size:10px; color:#555; margin-top:8px; }
  img { max-width:100%; border-radius:4px; margin-bottom:8px; position:relative; }
  img:hover { outline:2px solid #f44; cursor:pointer; }
  .img-wrap { position:relative; display:inline-block; }
  .img-wrap .del-btn { display:none; position:absolute; top:4px; right:4px; background:#f44; color:#fff; border:none; border-radius:50%; width:22px; height:22px; font-size:14px; line-height:22px; text-align:center; cursor:pointer; z-index:10; }
  .img-wrap:hover .del-btn { display:block; }
  .export-bar { position:fixed; bottom:24px; right:24px; display:flex; gap:8px; z-index:100; font-family:system-ui,-apple-system,sans-serif; }
  .export-bar button { background:#333; color:#ccc; border:1px solid #555; border-radius:8px; padding:10px 18px; font-size:13px; cursor:pointer; }
  .export-bar button:hover { background:#444; color:#fff; }
  @media print {
    .export-bar, .box-del, .del-btn, #add-section { display:none !important; }
    * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    html { background:#0d0d0d !important; }
    body { background:#0d0d0d !important; box-shadow:inset 0 0 0 9999px #0d0d0d !important; }
    .content { background:#0d0d0d !important; }
    .entry { background:#1a1a1a !important; border-color:#2a2a2a !important; box-shadow:inset 0 0 0 9999px #1a1a1a !important; }
  }
</style></head>
<body>
<div class="content" contenteditable="true">
<div class="export-bar" contenteditable="false">
<button id="save-pdf-btn">Save as PDF</button>
<button id="download-html-btn">Download HTML</button>
</div>
<h1>${title}</h1>`;

  for (const { day, items } of resolveEntries(tab, byDay, days)) {
    html += `<div class="day-header">${day}</div>`;
    for (const { entry, kind, idx } of items) {
      html += entryToHtmlBlock(entry, kind, idx, pageOffset);
    }
  }

  // Add-question button — appends a new .entry card identical to existing ones
  const qColor = TAB_COLORS["Q"];
  html += `<div id="add-section" style="margin-top:14px;">
<button id="add-question-btn" contenteditable="false" style="width:32px; height:32px; border-radius:50%; border:1.5px solid ${qColor}; background:${qColor}15; color:${qColor}; font-size:18px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; line-height:1;" title="Add question">+</button>
</div>`;

  html += `<script>
document.querySelectorAll(".entry img").forEach(img => {
  const wrap = document.createElement("span");
  wrap.className = "img-wrap";
  img.parentNode.insertBefore(wrap, img);
  wrap.appendChild(img);
  const btn = document.createElement("button");
  btn.className = "del-btn";
  btn.textContent = "\\u00d7";
  btn.contentEditable = "false";
  btn.onclick = e => { e.preventDefault(); if(confirm("Delete this image?")) wrap.remove(); };
  wrap.appendChild(btn);
});
function wireDeleteBtn(btn) {
  btn.onclick = e => { e.preventDefault(); btn.closest(".entry").remove(); };
}
document.querySelectorAll(".entry .box-del").forEach(wireDeleteBtn);
// Add question — creates same .entry card as existing ones
(function(){
  const addSection = document.getElementById("add-section");
  const addBtn = document.getElementById("add-question-btn");
  let qCount = document.querySelectorAll(".entry").length;
  function addQuestion() {
    qCount++;
    const card = document.createElement("div");
    card.className = "entry";
    card.innerHTML =
      '<button class="box-del" contenteditable="false" title="Delete this box">\\u00d7</button>' +
      '<div class="entry-label" style="color:${qColor};">Q' + qCount + '</div>' +
      '<div class="entry-text" style="min-height:20px; outline:none;" contenteditable="true"></div>';
    addSection.parentNode.insertBefore(card, addSection);
    wireDeleteBtn(card.querySelector(".box-del"));
    card.querySelector(".entry-text").focus();
  }
  addBtn.onclick = function(e){ e.preventDefault(); addQuestion(); };
})();
// Save as PDF
document.getElementById("save-pdf-btn").onclick = function(e) {
  e.preventDefault();
  window.print();
};
// Download edited HTML
document.getElementById("download-html-btn").onclick = function(e) {
  e.preventDefault();
  var content = document.querySelector(".content");
  var clone = content.cloneNode(true);
  // Remove toolbar and add-section from export
  var bar = clone.querySelector(".export-bar"); if(bar) bar.remove();
  var add = clone.querySelector("#add-section"); if(add) add.remove();
  clone.querySelectorAll(".box-del").forEach(function(b){b.remove();});
  clone.querySelectorAll(".del-btn").forEach(function(b){b.remove();});
  clone.removeAttribute("contenteditable");
  var style = document.querySelector("style").outerHTML;
  var out = "<!DOCTYPE html><html><head><meta charset=\\"utf-8\\">" + document.querySelector("title").outerHTML + style + "</head><body><div class=\\"content\\">" + clone.innerHTML + "</div></body></html>";
  var blob = new Blob([out], {type:"text/html"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = document.title.replace(/ /g,"_").toLowerCase() + ".html";
  a.click();
  URL.revokeObjectURL(url);
};
</script>`;
  html += `</div></body></html>`;
  return html;
}

function buildExportMarkdown(
  tab: string,
  byDay: Record<string, AnyEntry[] | TaggedEntry[]>,
  days: string[],
  pageOffset = 0,
): string {
  const lines: string[] = [`# ${TAB_LABELS[tab]}`, ""];
  for (const { day, items } of resolveEntries(tab, byDay, days)) {
    lines.push(`## ${day}`, "");
    for (const { entry, kind, idx } of items) {
      lines.push(entryToMarkdown(entry, kind, idx, pageOffset), "");
    }
  }
  return lines.join("\n");
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportAsImage(
  tab: string,
  byDay: Record<string, AnyEntry[] | TaggedEntry[]>,
  days: string[],
  pageOffset = 0,
) {
  const resolved = resolveEntries(tab, byDay, days);
  const titleColor = TAB_COLORS[tab];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const W = 700;
  const PAD = 24;
  const LINE_H = 18;

  // First pass: measure height
  let y = PAD + 24; // title
  for (const { items } of resolved) {
    y += 28; // day header
    for (const { entry: e } of items) {
      y += 8; // card padding top
      y += LINE_H; // prefix
      if ("imageDataUrl" in e && e.imageDataUrl) y += 160;
      if ("note" in e && (e as NoteEntry).note) {
        y += Math.ceil((e as NoteEntry).note.length / 70) * LINE_H;
      } else if ("exploration" in e && (e as ExplorationEntry).exploration) {
        y += Math.ceil((e as ExplorationEntry).exploration.length / 70) * LINE_H;
      } else if ("question" in e && (e as QuestionEntry).question) {
        y += Math.ceil((e as QuestionEntry).question.length / 70) * LINE_H;
      }
      if ("penStrokes" in e && e.penStrokes?.length) y += 90;
      if ("pageNumber" in e && e.pageNumber != null) y += 16;
      y += 16; // card padding bottom + gap
    }
  }
  // Questions height
  y += PAD;

  canvas.width = W;
  canvas.height = Math.max(y, 100);
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, canvas.height);

  // Title
  ctx.fillStyle = titleColor;
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText(TAB_LABELS[tab], PAD, PAD + 16);

  let cy = PAD + 36;

  // Load images first
  const imgCache = new Map<string, HTMLImageElement>();
  const imgPromises: Promise<void>[] = [];
  for (const { items } of resolved) {
    for (const { entry: e } of items) {
      const src = "imageDataUrl" in e ? e.imageDataUrl : undefined;
      if (src && !imgCache.has(src)) {
        const p = new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => { imgCache.set(src, img); resolve(); };
          img.onerror = () => resolve();
          img.src = src;
        });
        imgPromises.push(p);
      }
    }
  }
  await Promise.all(imgPromises);

  for (const { day, items } of resolved) {
    ctx.fillStyle = "#555";
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.fillText(day.toUpperCase(), PAD, cy + 10);
    cy += 24;

    for (const { entry: e, kind, idx } of items) {
      const color = TAB_COLORS[kind];
      // Card bg
      const cardTop = cy;
      ctx.fillStyle = "#1a1a1a";
      // We'll draw the card after measuring content height
      let cardH = 8; // top padding

      const prefix = `${kind}${idx + 1}`;
      cardH += LINE_H;

      let contentH = 0;
      if ("imageDataUrl" in e && e.imageDataUrl) contentH += 160;
      if ("note" in e && (e as NoteEntry).note) {
        contentH += Math.ceil((e as NoteEntry).note.length / 70) * LINE_H;
      } else if ("exploration" in e && (e as ExplorationEntry).exploration) {
        contentH += Math.ceil((e as ExplorationEntry).exploration.length / 70) * LINE_H;
      } else if ("question" in e && (e as QuestionEntry).question) {
        contentH += Math.ceil((e as QuestionEntry).question.length / 70) * LINE_H;
      }
      if ("penStrokes" in e && e.penStrokes?.length) contentH += 90;
      if ("pageNumber" in e && e.pageNumber != null) contentH += 16;
      cardH += contentH + 8;

      // Draw card bg
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      roundRect(ctx, PAD, cardTop, W - PAD * 2, cardH, 6);
      ctx.fill();

      let drawY = cardTop + 8;
      ctx.fillStyle = color;
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillText(prefix, PAD + 10, drawY + 12);
      drawY += LINE_H;

      // Image
      if ("imageDataUrl" in e && e.imageDataUrl) {
        const img = imgCache.get(e.imageDataUrl);
        if (img) {
          const imgW = Math.min(W - PAD * 2 - 20, img.width);
          const imgH = (imgW / img.width) * img.height;
          const clampH = Math.min(imgH, 150);
          ctx.drawImage(img, PAD + 10, drawY, imgW, clampH);
          drawY += clampH + 6;
        } else {
          drawY += 160;
        }
      }

      // Text
      ctx.fillStyle = "#ccc";
      ctx.font = "13px system-ui, sans-serif";
      let textContent = "";
      if ("note" in e) textContent = (e as NoteEntry).note || "";
      else if ("exploration" in e) textContent = (e as ExplorationEntry).exploration || "";
      else if ("question" in e) textContent = (e as QuestionEntry).question || "";
      if (textContent) {
        const words = textContent.split(/\s+/);
        let line = "";
        for (const word of words) {
          const test = line ? line + " " + word : word;
          if (ctx.measureText(test).width > W - PAD * 2 - 24) {
            ctx.fillText(line, PAD + 10, drawY + 13);
            drawY += LINE_H;
            line = word;
          } else {
            line = test;
          }
        }
        if (line) {
          ctx.fillText(line, PAD + 10, drawY + 13);
          drawY += LINE_H;
        }
      }

      // Page
      if ("pageNumber" in e && e.pageNumber != null) {
        ctx.fillStyle = "#555";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(`p. ${e.pageNumber + pageOffset}`, PAD + 10, drawY + 10);
        drawY += 16;
      }

      cy = cardTop + cardH + 8;
    }
  }

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${TAB_LABELS[tab].toLowerCase()}_export.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Export Modal ── */
function ExportModal({
  tab,
  byDay,
  selectedDays,
  onClose,
}: {
  tab: string;
  byDay: Record<string, AnyEntry[] | TaggedEntry[]>;
  selectedDays: string[];
  onClose: () => void;
}) {
  const [pageOffset, setPageOffset] = useState(0);
  const count = selectedDays.reduce((sum, d) => sum + (byDay[d]?.length || 0), 0);
  const color = TAB_COLORS[tab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg p-5 shadow-2xl max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-sm text-white font-medium mb-1">
          Export <span style={{ color }}>{TAB_LABELS[tab]}</span>
        </div>
        <div className="text-[10px] text-[#666] mb-4">
          {count} item{count !== 1 ? "s" : ""} across {selectedDays.length} day{selectedDays.length !== 1 ? "s" : ""}
        </div>

        {/* Page offset setting */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <label className="text-[10px] text-[#888] whitespace-nowrap">Page offset</label>
          <input
            type="number"
            value={pageOffset || ""}
            onChange={e => setPageOffset(parseInt(e.target.value, 10) || 0)}
            placeholder="0"
            className="w-16 px-2 py-1 text-xs text-center bg-[#0d0d0d] border border-[#2a2a2a] rounded text-white outline-none focus:border-[#444]"
          />
          <span className="text-[10px] text-[#555]">
            {pageOffset !== 0 ? `p. 10 → p. ${10 + pageOffset}` : "adjust exported page numbers"}
          </span>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => {
              const html = buildExportHtml(tab, byDay, selectedDays, pageOffset);
              const win = window.open("", "_blank");
              if (win) { win.document.write(html); win.document.close(); }
              else { downloadHtml(html, `${TAB_LABELS[tab].toLowerCase()}_export.html`); }
              onClose();
            }}
            className="w-full text-left px-3 py-2.5 rounded bg-[#0d0d0d] border border-[#2a2a2a] hover:border-[#444] transition-colors group"
          >
            <div className="text-xs text-white group-hover:text-[#7173e6] transition-colors">Open as HTML</div>
            <div className="text-[10px] text-[#555]">Editable in browser — edit content, then download or print</div>
          </button>

          <button
            onClick={() => {
              downloadText(
                buildExportMarkdown(tab, byDay, selectedDays, pageOffset),
                `${TAB_LABELS[tab].toLowerCase()}_export.md`,
              );
              onClose();
            }}
            className="w-full text-left px-3 py-2.5 rounded bg-[#0d0d0d] border border-[#2a2a2a] hover:border-[#444] transition-colors group"
          >
            <div className="text-xs text-white group-hover:text-[#7173e6] transition-colors">Save as Markdown</div>
            <div className="text-[10px] text-[#555]">Plain text with formatting — easy to edit and combine</div>
          </button>

          <button
            onClick={() => { exportAsImage(tab, byDay, selectedDays, pageOffset); onClose(); }}
            className="w-full text-left px-3 py-2.5 rounded bg-[#0d0d0d] border border-[#2a2a2a] hover:border-[#444] transition-colors group"
          >
            <div className="text-xs text-white group-hover:text-[#7173e6] transition-colors">Save as PNG Image</div>
            <div className="text-[10px] text-[#555]">Single image snapshot of all content</div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-xs text-[#666] hover:text-white transition-colors py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Copy helper — copies image + text together when both are available ── */
async function toPngBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  // Convert to PNG via canvas
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve) =>
    canvas.toBlob(b => resolve(b!), "image/png")
  );
}

async function copyEntryToClipboard(dataUrl: string, text?: string) {
  try {
    const pngBlob = await toPngBlob(dataUrl);
    const items: Record<string, Blob> = { "image/png": pngBlob };
    if (text) {
      // Include as both plain text and HTML (image + text below it)
      items["text/plain"] = new Blob([text], { type: "text/plain" });
      const html = `<img src="${dataUrl}" style="max-width:100%;"><br><p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`;
      items["text/html"] = new Blob([html], { type: "text/html" });
    }
    await navigator.clipboard.write([new ClipboardItem(items)]);
    return true;
  } catch {
    return false;
  }
}

/* ── Main Component ── */
export default function SidePanel({ textExtracts, notes, questions, explorations, onDeleteExtract, onDeleteNote, onDeleteQuestion, onDeleteExploration, onUndoExtract, onUndoNote, onUndoQuestion, onUndoExploration, onJumpToText, onEditNote, onEditQuestion, onEditExploration, onNoteToQuestion, onNoteToExploration, onQuestionToNote, onQuestionToExploration, onExplorationToNote, onExplorationToQuestion }: Props) {
  const [tab, setTab] = useState<"T" | "N" | "Q" | "E" | "A">("N");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [undoToast, setUndoToast] = useState<{ label: string; onUndo: () => void } | null>(null);
  const [sortAsc, setSortAsc] = useState(false); // false = newest first
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const nByDay = groupByDay(notes);
  const qByDay = groupByDay(questions);
  const eByDay = groupByDay(explorations);
  const aByDay = useMemo(() => groupAllByDay([], notes, questions, explorations), [notes, questions, explorations]);

  // Universal calendar — dates from ALL entries so selection persists across tabs
  const currentByDay = tab === "N" ? nByDay : tab === "Q" ? qByDay : tab === "E" ? eByDay : aByDay;
  const allDates = useMemo(() => new Set(Object.keys(aByDay)), [aByDay]);

  // Sorted + filtered days
  const sortedDays = useMemo(() => {
    let days = Object.keys(currentByDay);
    if (selectedDates.size > 0) {
      days = days.filter(d => selectedDates.has(d));
    }
    days.sort();
    if (!sortAsc) days.reverse();
    return days;
  }, [currentByDay, selectedDates, sortAsc]);

  const toggleDate = useCallback((date: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const accentColor = TAB_COLORS[tab];
  const currentEntries = tab === "N" ? notes : tab === "Q" ? questions : tab === "E" ? explorations : [...notes, ...questions, ...explorations];

  const requestDeleteExtract = useCallback((t: TextExtract) => {
    setConfirm({ type: "extract", id: t.id, label: `T${t.number}` });
  }, []);

  const requestDeleteNote = useCallback((n: NoteEntry) => {
    setConfirm({ type: "note", id: n.id, label: `N${n.number}` });
  }, []);

  const requestDeleteQuestion = useCallback((q: QuestionEntry) => {
    setConfirm({ type: "question", id: q.id, label: `Q${q.number}` });
  }, []);

  const requestDeleteExploration = useCallback((e: ExplorationEntry) => {
    setConfirm({ type: "exploration" as any, id: e.id, label: `E${e.number}` });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!confirm) return;
    const { type, id, label } = confirm;

    if (type === "extract") {
      const item = textExtracts.find(t => t.id === id);
      onDeleteExtract(id);
      if (item && onUndoExtract) {
        setUndoToast({
          label,
          onUndo: () => { onUndoExtract(item); setUndoToast(null); },
        });
      }
    } else if (type === "note") {
      const item = notes.find(n => n.id === id);
      onDeleteNote(id);
      if (item && onUndoNote) {
        setUndoToast({
          label,
          onUndo: () => { onUndoNote(item); setUndoToast(null); },
        });
      }
    } else if (type === "question") {
      const item = questions.find(q => q.id === id);
      onDeleteQuestion(id);
      if (item && onUndoQuestion) {
        setUndoToast({
          label,
          onUndo: () => { onUndoQuestion(item); setUndoToast(null); },
        });
      }
    } else if (type === "exploration") {
      const item = explorations.find(e => e.id === id);
      onDeleteExploration(id);
      if (item && onUndoExploration) {
        setUndoToast({
          label,
          onUndo: () => { onUndoExploration(item); setUndoToast(null); },
        });
      }
    }
    setConfirm(null);
  }, [confirm, textExtracts, notes, questions, explorations, onDeleteExtract, onDeleteNote, onDeleteQuestion, onDeleteExploration, onUndoExtract, onUndoNote, onUndoQuestion, onUndoExploration]);

  return (
    <div className="flex flex-col h-full">
      {/* Confirm dialog */}
      {confirm && createPortal(
        <ConfirmDialog
          label={confirm.label}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />,
        document.body,
      )}

      {/* Undo toast */}
      {undoToast && createPortal(
        <UndoToast
          label={undoToast.label}
          onUndo={undoToast.onUndo}
          onDismiss={() => setUndoToast(null)}
        />,
        document.body,
      )}

      {/* Export modal */}
      {showExport && createPortal(
        <ExportModal
          tab={tab}
          byDay={currentByDay as Record<string, AnyEntry[] | TaggedEntry[]>}
          selectedDays={selectedDates.size > 0 ? [...selectedDates].sort() : Object.keys(currentByDay).sort()}
          onClose={() => setShowExport(false)}
        />,
        document.body,
      )}

      {/* Tab switcher */}
      <div className="flex border-b border-[#1e1e1e] flex-shrink-0">
        <button
          onClick={() => setTab("N")}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            tab === "N" ? "text-[#5a8a5a] border-b-2 border-[#5a8a5a]" : "text-[#555] hover:text-[#888]"
          }`}
        >
          Notes ({notes.length})
        </button>
        <button
          onClick={() => setTab("Q")}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            tab === "Q" ? "text-[#c06090] border-b-2 border-[#c06090]" : "text-[#555] hover:text-[#888]"
          }`}
        >
          Questions ({questions.length})
        </button>
        <button
          onClick={() => setTab("E")}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            tab === "E" ? "text-[#e0a040] border-b-2 border-[#e0a040]" : "text-[#555] hover:text-[#888]"
          }`}
        >
          Exploration ({explorations.length})
        </button>
        <button
          onClick={() => setTab("A")}
          className={`flex-1 text-xs py-2 font-medium transition-colors ${
            tab === "A" ? "text-[#aaa] border-b-2 border-[#aaa]" : "text-[#555] hover:text-[#888]"
          }`}
        >
          All ({notes.length + questions.length + explorations.length})
        </button>
      </div>

      {/* Toolbar: sort, calendar, export */}
      {(notes.length + questions.length + explorations.length) > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e1e1e] flex-shrink-0">
          <button
            onClick={() => setSortAsc(v => !v)}
            className="px-2 py-1 text-[10px] rounded bg-[#0d0d0d] border border-[#2a2a2a] text-[#888] hover:text-white transition-colors"
            title={sortAsc ? "Oldest first" : "Newest first"}
          >
            {sortAsc ? "Old ↑" : "New ↓"}
          </button>
          <button
            onClick={() => setShowCalendar(v => !v)}
            className={`px-2 py-1 text-[10px] rounded border transition-colors ${
              showCalendar
                ? "border-[#444] text-white bg-[#1a1a1a]"
                : "border-[#2a2a2a] text-[#888] hover:text-white bg-[#0d0d0d]"
            }`}
          >
            Cal {selectedDates.size > 0 ? `(${selectedDates.size})` : ""}
          </button>
          {selectedDates.size > 0 && (
            <button
              onClick={() => setSelectedDates(new Set())}
              className="px-2 py-1 text-[10px] rounded bg-[#0d0d0d] border border-[#2a2a2a] text-[#888] hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setShowExport(true)}
            className="px-2 py-1 text-[10px] rounded border border-[#2a2a2a] text-[#888] hover:text-white bg-[#0d0d0d] transition-colors"
            title="Export entries"
          >
            Export
          </button>
        </div>
      )}

      {/* Universal calendar — shared across all tabs */}
      {showCalendar && (
        <div className="border-b border-[#1e1e1e] flex-shrink-0">
          <MiniCalendar
            datesWithEntries={allDates}
            selectedDates={selectedDates}
            onToggleDate={toggleDate}
            accentColor="#7173e6"
          />
        </div>
      )}

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {tab === "N" ? (
          notes.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              Select text and press N to add a note
            </div>
          ) : sortedDays.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              No entries for selected dates
            </div>
          ) : (
            sortedDays.map(day => (
              <div key={day}>
                <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">{day}</div>
                <div className="space-y-3">
                  {nByDay[day].map(n => {
                    const imgSrc = n.imageDataUrl || (n.selectedText.startsWith("data:image/") ? n.selectedText : null);
                    return (
                    <div
                      key={n.id}
                      className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 group transition-colors ${
                        n.pageNumber != null && onJumpToText ? "cursor-pointer hover:border-[#5a8a5a]/50" : ""
                      }`}
                      onClick={() => {
                        if (editingId === n.id) return;
                        if (n.pageNumber != null && onJumpToText) onJumpToText(n.pageNumber, n.selectedText);
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-[11px] font-bold text-[#5a8a5a] flex-shrink-0 mt-0.5">N{notes.indexOf(n) + 1}</span>
                        <div className="flex-1 min-w-0">
                          {imgSrc && (
                            <img src={imgSrc} alt={`Note N${n.number} screenshot`} className="rounded w-full mb-2" />
                          )}
                          {editingId === n.id ? (
                            <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                              <textarea
                                ref={el => { (editRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="w-full bg-[#0d0d0d] border border-[#3a3a3a] rounded text-[13px] text-[#ccc] px-2 py-1.5 leading-[1.6] resize-none overflow-hidden min-h-[60px] focus:outline-none focus:border-[#5a8a5a]"
                                onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === "Escape") { setEditingId(null); }
                                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    onEditNote?.(n.id, editText);
                                    setEditingId(null);
                                  }
                                }}
                              />
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-2 py-1 text-[10px] rounded bg-[#2a2a2a] text-[#aaa] hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => { onEditNote?.(n.id, editText); setEditingId(null); }}
                                  className="px-2 py-1 text-[10px] rounded bg-[#5a8a5a] text-white hover:bg-[#4a7a4a] transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : n.note ? (
                            <div className="text-[13px] text-[#ccc] whitespace-pre-wrap break-words leading-[1.6]">{n.note}</div>
                          ) : null}
                          {n.penStrokes && n.penStrokes.length > 0 && (
                            <StrokePreview strokes={n.penStrokes} />
                          )}
                          {n.pageNumber != null && (
                            <div className="text-[10px] text-[#555] mt-2 flex items-center gap-1">
                              <span>p. {n.pageNumber}</span>
                              {onJumpToText && <span className="text-[#5a8a5a]">{"— click to jump"}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {imgSrc && (
                            <button
                              onClick={async e => {
                                e.stopPropagation();
                                const ok = await copyEntryToClipboard(imgSrc, n.note);
                                if (ok) { setCopiedId(n.id); setTimeout(() => setCopiedId(null), 1500); }
                              }}
                              className={`text-[10px] rounded px-1.5 py-0.5 transition-colors ${
                                copiedId === n.id
                                  ? "text-[#5a8a5a] bg-[#5a8a5a]/10"
                                  : "text-[#555] hover:text-[#5a8a5a] hover:bg-[#152a15]"
                              }`}
                              title="Copy to clipboard"
                            >
                              {copiedId === n.id ? "Copied" : "Copy"}
                            </button>
                          )}
                          {editingId !== n.id && onEditNote && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditingId(n.id); setEditText(n.note || ""); }}
                              className="text-[10px] text-[#555] hover:text-[#5a8a5a] hover:bg-[#152a15] rounded px-1.5 py-0.5 transition-colors"
                              title="Edit note"
                            >
                              Edit
                            </button>
                          )}
                          {onNoteToQuestion && (
                            <button
                              onClick={e => { e.stopPropagation(); onNoteToQuestion(n.id); }}
                              className="text-[10px] text-[#555] hover:text-[#c06090] hover:bg-[#2a152a] rounded px-1.5 py-0.5 transition-colors"
                              title="Convert to question"
                            >
                              → Q
                            </button>
                          )}
                          {onNoteToExploration && (
                            <button
                              onClick={e => { e.stopPropagation(); onNoteToExploration(n.id); }}
                              className="text-[10px] text-[#555] hover:text-[#e0a040] hover:bg-[#2a2515] rounded px-1.5 py-0.5 transition-colors"
                              title="Convert to exploration"
                            >
                              → E
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); requestDeleteNote(n); }}
                            className="text-xs text-[#555] hover:text-[#e06060] hover:bg-[#2a1515] rounded px-1.5 py-0.5 transition-colors"
                            title="Delete note"
                          >
                            {"✕"}
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))
          )
        ) : tab === "Q" ? (
          questions.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              Select text and press Q to add a question
            </div>
          ) : sortedDays.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              No entries for selected dates
            </div>
          ) : (
            sortedDays.map(day => (
              <div key={day}>
                <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">{day}</div>
                <div className="space-y-3">
                  {qByDay[day].map(q => {
                    const imgSrc = q.imageDataUrl || (q.selectedText.startsWith("data:image/") ? q.selectedText : null);
                    return (
                    <div
                      key={q.id}
                      className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 group transition-colors ${
                        q.pageNumber != null && onJumpToText ? "cursor-pointer hover:border-[#c06090]/50" : ""
                      }`}
                      onClick={() => {
                        if (editingId === q.id) return;
                        if (q.pageNumber != null && onJumpToText) onJumpToText(q.pageNumber, q.selectedText);
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-[11px] font-bold text-[#c06090] flex-shrink-0 mt-0.5">Q{questions.indexOf(q) + 1}</span>
                        <div className="flex-1 min-w-0">
                          {imgSrc && (
                            <img src={imgSrc} alt={`Question Q${q.number} screenshot`} className="rounded w-full mb-2" />
                          )}
                          {editingId === q.id ? (
                            <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                              <textarea
                                ref={el => { (editRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="w-full bg-[#0d0d0d] border border-[#3a3a3a] rounded text-[13px] text-[#ccc] px-2 py-1.5 leading-[1.6] resize-none overflow-hidden min-h-[60px] focus:outline-none focus:border-[#c06090]"
                                onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === "Escape") { setEditingId(null); }
                                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    onEditQuestion?.(q.id, editText);
                                    setEditingId(null);
                                  }
                                }}
                              />
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-2 py-1 text-[10px] rounded bg-[#2a2a2a] text-[#aaa] hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => { onEditQuestion?.(q.id, editText); setEditingId(null); }}
                                  className="px-2 py-1 text-[10px] rounded bg-[#c06090] text-white hover:bg-[#a04070] transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : q.question ? (
                            <div className="text-[13px] text-[#ccc] whitespace-pre-wrap break-words leading-[1.6]">{q.question}</div>
                          ) : null}
                          {q.penStrokes && q.penStrokes.length > 0 && (
                            <StrokePreview strokes={q.penStrokes} />
                          )}
                          {q.pageNumber != null && (
                            <div className="text-[10px] text-[#555] mt-2 flex items-center gap-1">
                              <span>p. {q.pageNumber}</span>
                              {onJumpToText && <span className="text-[#c06090]">{"— click to jump"}</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {imgSrc && (
                            <button
                              onClick={async e => {
                                e.stopPropagation();
                                const ok = await copyEntryToClipboard(imgSrc, q.question);
                                if (ok) { setCopiedId(q.id); setTimeout(() => setCopiedId(null), 1500); }
                              }}
                              className={`text-[10px] rounded px-1.5 py-0.5 transition-colors ${
                                copiedId === q.id
                                  ? "text-[#c06090] bg-[#c06090]/10"
                                  : "text-[#555] hover:text-[#c06090] hover:bg-[#2a1520]"
                              }`}
                              title="Copy to clipboard"
                            >
                              {copiedId === q.id ? "Copied" : "Copy"}
                            </button>
                          )}
                          {editingId !== q.id && onEditQuestion && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditingId(q.id); setEditText(q.question || ""); }}
                              className="text-[10px] text-[#555] hover:text-[#c06090] hover:bg-[#2a1520] rounded px-1.5 py-0.5 transition-colors"
                              title="Edit question"
                            >
                              Edit
                            </button>
                          )}
                          {onQuestionToNote && (
                            <button
                              onClick={e => { e.stopPropagation(); onQuestionToNote(q.id); }}
                              className="text-[10px] text-[#555] hover:text-[#5a8a5a] hover:bg-[#152a15] rounded px-1.5 py-0.5 transition-colors"
                              title="Convert to note"
                            >
                              → N
                            </button>
                          )}
                          {onQuestionToExploration && (
                            <button
                              onClick={e => { e.stopPropagation(); onQuestionToExploration(q.id); }}
                              className="text-[10px] text-[#555] hover:text-[#e0a040] hover:bg-[#2a2515] rounded px-1.5 py-0.5 transition-colors"
                              title="Convert to exploration"
                            >
                              → E
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); requestDeleteQuestion(q); }}
                            className="text-xs text-[#555] hover:text-[#e06060] hover:bg-[#2a1515] rounded px-1.5 py-0.5 transition-colors"
                            title="Delete question"
                          >
                            {"✕"}
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))
          )
        ) : tab === "E" ? (
          explorations.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              Select text and press E to add an exploration
            </div>
          ) : sortedDays.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              No entries for selected dates
            </div>
          ) : (
            sortedDays.map(day => (
              <div key={day}>
                <div className="text-[10px] text-[#555] uppercase tracking-widest px-2 py-1.5 sticky top-0 bg-[#0d0d0d] z-10 border-b border-[#1a1a1a]">{day}</div>
                <div className="px-2 py-1">
                  {(eByDay[day] || []).sort((a, b) => sortAsc ? a.timestamp - b.timestamp : b.timestamp - a.timestamp).map(ex => {
                    const imgSrc = ex.imageDataUrl || (ex.selectedText?.startsWith("data:image/") ? ex.selectedText : undefined);
                    return (
                    <div
                      key={ex.id}
                      className={`mb-2 p-2.5 rounded border border-[#1e1e1e] bg-[#111] transition-colors ${
                        ex.pageNumber != null && onJumpToText ? "cursor-pointer hover:border-[#e0a040]/50" : ""
                      }`}
                      onClick={() => {
                        if (ex.pageNumber != null && onJumpToText) onJumpToText(ex.pageNumber, ex.selectedText);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-[#e0a040] mb-1">E{ex.number}</div>
                          {imgSrc && (
                            <img src={imgSrc} alt={`Exploration E${ex.number} screenshot`} className="rounded w-full mb-2" />
                          )}
                          {editingId === ex.id ? (
                            <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                              <textarea
                                ref={el => { (editRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="w-full bg-[#0d0d0d] border border-[#3a3a3a] rounded text-[13px] text-[#ccc] px-2 py-1.5 leading-[1.6] resize-none overflow-hidden min-h-[60px] focus:outline-none focus:border-[#e0a040]"
                                onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === "Escape") { setEditingId(null); }
                                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    onEditExploration?.(ex.id, editText);
                                    setEditingId(null);
                                  }
                                }}
                              />
                              <div className="flex gap-1.5 justify-end">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="px-2 py-1 text-[10px] rounded bg-[#2a2a2a] text-[#aaa] hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => { onEditExploration?.(ex.id, editText); setEditingId(null); }}
                                  className="px-2 py-1 text-[10px] rounded bg-[#e0a040] text-white hover:bg-[#c88a30] transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : ex.exploration ? (
                            <div className="text-[13px] text-[#ccc] whitespace-pre-wrap leading-[1.6]">{ex.exploration}</div>
                          ) : null}
                          {ex.pageNumber != null && (
                            <div className="text-[10px] text-[#555] mt-2">
                              <span>p. {ex.pageNumber}</span>
                              {onJumpToText && <span className="text-[#e0a040]/50 ml-1">— click to jump</span>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {editingId !== ex.id && onEditExploration && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditingId(ex.id); setEditText(ex.exploration || ""); }}
                              className="text-[10px] text-[#555] hover:text-[#e0a040] hover:bg-[#2a2515] rounded px-1.5 py-0.5 transition-colors"
                              title="Edit exploration"
                            >
                              Edit
                            </button>
                          )}
                          {onExplorationToNote && (
                            <button
                              onClick={e => { e.stopPropagation(); onExplorationToNote(ex.id); }}
                              className="text-[10px] text-[#555] hover:text-[#5a8a5a] hover:bg-[#152a15] rounded px-1.5 py-0.5 transition-colors"
                              title="Convert to note"
                            >
                              → N
                            </button>
                          )}
                          {onExplorationToQuestion && (
                            <button
                              onClick={e => { e.stopPropagation(); onExplorationToQuestion(ex.id); }}
                              className="text-[10px] text-[#555] hover:text-[#c06090] hover:bg-[#2a152a] rounded px-1.5 py-0.5 transition-colors"
                              title="Convert to question"
                            >
                              → Q
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); requestDeleteExploration(ex); }}
                            className="text-xs text-[#555] hover:text-[#e06060] hover:bg-[#2a1515] rounded px-1.5 py-0.5 transition-colors"
                            title="Delete exploration"
                          >
                            {"✕"}
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))
          )
        ) : (
          /* All tab */
          currentEntries.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              No entries yet
            </div>
          ) : sortedDays.length === 0 ? (
            <div className="text-xs text-[#444] text-center py-8">
              No entries for selected dates
            </div>
          ) : (
            sortedDays.map(day => (
              <div key={day}>
                <div className="text-[10px] text-[#555] uppercase tracking-widest mb-2">{day}</div>
                <div className="space-y-3">
                  {(aByDay[day] || []).map(tagged => {
                    const isT = tagged.kind === "T";
                    const isN = tagged.kind === "N";
                    const isE = tagged.kind === "E";
                    const entry = tagged.entry;
                    const imgSrc = isT
                      ? ((entry as any).imageDataUrl || ((entry as any).text?.startsWith("data:image/") ? (entry as any).text : null))
                      : ((entry as any).imageDataUrl || ((entry as any).selectedText?.startsWith("data:image/") ? (entry as any).selectedText : null));
                    const color = isT ? "#7173e6" : isN ? "#5a8a5a" : isE ? "#e0a040" : "#c06090";
                    const label = `${tagged.kind}${tagged.idx + 1}`;
                    return (
                      <div
                        key={`${tagged.kind}-${entry.id}`}
                        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 group transition-colors"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-[11px] font-bold flex-shrink-0 mt-0.5" style={{ color }}>{label}</span>
                          <div className="flex-1 min-w-0">
                            {imgSrc && <img src={imgSrc} alt="" className="rounded w-full mb-2" />}
                            {isN && (entry as any).note && (
                              <div className="text-[13px] text-[#ccc] whitespace-pre-wrap break-words leading-[1.6]">{(entry as any).note}</div>
                            )}
                            {isE && (entry as any).exploration && (
                              <div className="text-[13px] text-[#ccc] whitespace-pre-wrap break-words leading-[1.6]">{(entry as any).exploration}</div>
                            )}
                            {!isT && !isN && !isE && (entry as any).question && (
                              <div className="text-[13px] text-[#ccc] whitespace-pre-wrap break-words leading-[1.6]">{(entry as any).question}</div>
                            )}
                            {!isT && (entry as any).penStrokes && (entry as any).penStrokes.length > 0 && (
                              <StrokePreview strokes={(entry as any).penStrokes} />
                            )}
                            {(entry as any).pageNumber != null && (
                              <div className="text-[10px] text-[#555] mt-2">p. {(entry as any).pageNumber}</div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            {imgSrc && (
                              <button
                                onClick={async e => {
                                  e.stopPropagation();
                                  const entryText = isN ? (entry as any).note : isE ? (entry as any).exploration : !isT ? (entry as any).question : undefined;
                                  const ok = await copyEntryToClipboard(imgSrc, entryText);
                                  if (ok) { setCopiedId(entry.id); setTimeout(() => setCopiedId(null), 1500); }
                                }}
                                className={`text-[10px] rounded px-1.5 py-0.5 transition-colors ${
                                  copiedId === entry.id ? "text-white" : "text-[#555] hover:text-white"
                                }`}
                                style={copiedId === entry.id ? { color } : undefined}
                              >
                                {copiedId === entry.id ? "Copied" : "Copy"}
                              </button>
                            )}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (isT) requestDeleteExtract(entry as any);
                                else if (isN) requestDeleteNote(entry as any);
                                else if (isE) requestDeleteExploration(entry as any);
                                else requestDeleteQuestion(entry as any);
                              }}
                              className="text-xs text-[#555] hover:text-[#e06060] hover:bg-[#2a1515] rounded px-1.5 py-0.5 transition-colors"
                              title="Delete"
                            >
                              {"✕"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
