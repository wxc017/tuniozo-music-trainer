// ── Types ──────────────────────────────────────────────────────────────────────

import { jianpuToPitch } from "./jianpu";

export type ClefType = "treble" | "bass";
export type Duration = "w" | "h" | "q" | "8" | "16" | "32";
export type AccidentalType = "n" | "b" | "#";

/** Notehead glyph variants supported by VexFlow.  Used in drum mode
 *  to distinguish drums (default round head), cymbals (X), bells /
 *  cross-sticks (circle-X), rim shots (diamond), etc.  Harmonic mode
 *  ignores this field. */
export type NoteheadType = "default" | "x" | "circle-x" | "diamond" | "triangle";

/** VexFlow key suffix for a notehead.  Append directly to the pitch
 *  string (e.g. `"c/5" + NOTEHEAD_SUFFIX.x`  →  `"c/5/x2"`). */
export const NOTEHEAD_SUFFIX: Record<NoteheadType, string> = {
  "default":  "",
  "x":        "/x2",
  "circle-x": "/x3",
  "diamond":  "/d0",
  "triangle": "/t1",
};

export const NOTEHEAD_LABELS: Record<NoteheadType, string> = {
  "default":  "Drum",
  "x":        "X (Cymbal)",
  "circle-x": "Ø (Bell / Cross-stick)",
  "diamond":  "◇ (Rim-shot)",
  "triangle": "△ (Variant)",
};

export const NOTEHEAD_ORDER: NoteheadType[] = ["default", "x", "circle-x", "diamond", "triangle"];

// ── Drum-mode articulations & stickings ─────────────────────────────
// Mirrors the semantics of `accentData.ts` (used by AccentStudy /
// VexDrumNotation) so the rendering style is consistent across the
// app: accent = ">"  ghost = parens  flam = 1 grace note  drag = 2
// buzz = "z" on the stem (standard buzz-roll notation).
export type DrumArticulation = "normal" | "accent" | "ghost" | "flam" | "drag" | "buzz";

export const DRUM_ARTIC_LABELS: Record<DrumArticulation, string> = {
  normal: "Normal",
  accent: "Accent (>)",
  ghost:  "Ghost ( )",
  flam:   "Flam",
  drag:   "Drag",
  buzz:   "Buzz (z)",
};

export const DRUM_ARTIC_ORDER: DrumArticulation[] = ["normal", "accent", "ghost", "flam", "drag", "buzz"];

/** Stick assignment shown above a note (R = right, L = left).  Same
 *  letter convention as `accentData.Sticking` derivations. */
export type DrumStick = "R" | "L";

export const DURATION_SLOTS: Record<Duration, number> = {
  w: 32, h: 16, q: 8, "8": 4, "16": 2, "32": 1,
};

export const DURATION_ORDER: Duration[] = ["w", "h", "q", "8", "16", "32"];

export const VF_DURATION_MAP: Record<Duration, string> = {
  w: "w", h: "h", q: "q", "8": "8", "16": "16", "32": "32",
};

export const DURATION_LABELS: Record<Duration, string> = {
  w: "𝅝", h: "𝅗𝅥", q: "𝅘𝅥", "8": "𝅘𝅥𝅮", "16": "𝅘𝅥𝅯", "32": "𝅘𝅥𝅰",
};

export const DURATION_NAMES: Record<Duration, string> = {
  w: "Whole", h: "Half", q: "Quarter", "8": "8th", "16": "16th", "32": "32nd",
};

export interface NoteData {
  id: string;
  measure: number;
  startSlot: number;
  duration: Duration;
  dotted?: boolean;
  pitch: string;
  accidental?: AccidentalType;
  isTieStart?: boolean;
  isTieEnd?: boolean;
  bendSteps?: number;
  isRest: boolean;
  /** Optional notehead glyph (drum mode).  Falls back to "default"
   *  when absent — harmonic mode never sets this so its rendering is
   *  unchanged. */
  notehead?: NoteheadType;
  /** Drum-mode articulation: accent / ghost / flam / drag.  Absent or
   *  "normal" → no extra modifier.  Harmonic mode ignores this. */
  articulation?: DrumArticulation;
  /** Hi-hat open/closed mark (independent of articulation): "open" draws an
   *  "o" above the note, "closed" a "+".  Standard drum notation for an open
   *  vs. foot-closed/choked hi-hat. */
  hihatOpen?: "open" | "closed";
  /** Drum-mode stick assignment ("R" / "L") shown above the note. */
  stick?: DrumStick;
  /** Drum-mode tuplet number (3 = triplet, 5 = quintuplet, 6 = sextuplet,
   *  7 = septuplet).  Consecutive notes sharing the same tuplet value
   *  get wrapped in a single VexFlow Tuplet bracket at render time. */
  tuplet?: 3 | 5 | 6 | 7;

  // ── Jianpu (numbered notation) fields ──────────────────────────────
  // Jianpu scores author notes directly as scale-degree + octave + accidental
  // so the numbered renderer never reverse-engineers a staff pitch.  A
  // concrete `pitch`/`accidental` is still derived and stored above so
  // playback and MusicXML reuse the standard code paths.  Harmonic and drum
  // modes ignore all of these.
  /** Voice/line index (0 = top).  0/1 = the two default voices (RH/LH);
   *  jianpu scores may add more voice lines, so this is an open index. */
  voice?: number;
  /** Scale degree 1–7 (rests use `isRest`; the number 0 is shown for a rest). */
  jianpuDegree?: number;
  /** Signed octave-dot count: +1 = one dot above (octave up), −1 = one below. */
  jianpuOctave?: number;
  /** Explicit accidental shown before the number ("#", "b", or "n" natural). */
  jianpuAccidental?: "#" | "b" | "n";
  /** Jianpu-only: chromatic alteration of the degree in EDO steps (0 = the bare
   *  diatonic degree).  Supersedes `jianpuAccidental`; legacy notes fall back to
   *  it (#→+1, b→−1). */
  alteration?: number;
  /** Jianpu-only: draw this note's duration underline separately (breaks the
   *  beam) instead of beaming it with its neighbours.  Absent → beamed. */
  separateUnderline?: boolean;
  /** Jianpu-only: staccato — a dot drawn above the number/syllable. */
  staccato?: boolean;
}

/** Actual slot count occupied by a note, accounting for the dot (1.5×). */
export function noteSlots(n: Pick<NoteData, "duration" | "dotted">): number {
  const base = DURATION_SLOTS[n.duration];
  return n.dotted ? base * 1.5 : base;
}

export interface MeasureTimeSig {
  num: number;
  den: number;
}

export interface ScoreSetup {
  clef: ClefType;
  keySignature: number;
  defaultTimeSig: MeasureTimeSig;
  barCount: number;
  perBarTimeSig?: Record<number, MeasureTimeSig>;
  /** Per-bar Volta label ("A", "B", "C", "1.", "2.", etc.).  Drum
   *  mode renders this as a 1st/2nd/3rd-ending bracket above the
   *  bar.  Multi-bar voltas are inferred by adjacent bars sharing
   *  the same label. */
  perBarVolta?: Record<number, string>;
  /** Per-bar section title (e.g. "Verse", "Chorus", "Bridge").
   *  Drum mode renders this as a boxed text section above the bar. */
  perBarTitle?: Record<number, string>;
  /** Per-bar section label (e.g. "A", "B", "Exercise 1 — arpeggios").
   *  Jianpu/Sol-fa mode renders this as a large bold heading and forces
   *  the bar to start a new line, so one sheet can hold many labelled
   *  exercises under a single big title. */
  perBarSection?: Record<number, string>;
  /** Per-bar manual line break.  When true, the bar starts a new
   *  row regardless of MEASURES_PER_ROW.  Bar 0 is always a row
   *  start so this flag is ignored on it. */
  perBarBreakBefore?: Record<number, boolean>;
}

export interface SyncPoint {
  measure: number;
  timestamp: number;
}

export type Instrument = "harmonic" | "drum" | "jianpu";

export interface NoteEntryProject {
  id: string;
  title: string;
  /** Composer / arranger credit shown alongside the title.  Optional;
   *  legacy projects without this field render no composer line. */
  composer?: string;
  setup: ScoreSetup;
  notes: NoteData[];
  syncPoints: SyncPoint[];
  youtubeUrl: string;
  createdAt: number;
  /** Instrument family — picked at score creation.  Legacy projects
   *  without this field are treated as "harmonic". */
  instrument?: Instrument;
  /** BPM for drum-mode playback.  Defaults to 100 when absent. */
  tempo?: number;
  /** Jianpu-only display system: numbered ("jianpu") or tonic sol-fa
   *  ("solfa").  Display-only — the underlying degree data is identical. */
  displaySystem?: "jianpu" | "solfa";
  /** Jianpu-only number of voice lines (≥ 2).  Grows when the user adds a
   *  voice; empty extra voices collapse away.  Absent → 2.  Legacy/global
   *  fallback — per-section counts in `perSectionVoiceCount` supersede it. */
  voiceCount?: number;
  /** Jianpu/Sol-fa mode: voice-line count per section, keyed by the section's
   *  start bar (bar 0, or any bar carrying a `perBarSection` label).  Lets each
   *  labelled exercise have its own number of voices independently.  A section
   *  with no entry falls back to `voiceCount` (bar 0) or the 2-voice minimum. */
  perSectionVoiceCount?: Record<number, number>;
  /** Jianpu-only: join the voice lines with a piano grand-staff brace ({ )
   *  so they read as two hands of one instrument. */
  pianoBrace?: boolean;
  /** Jianpu-only: equal divisions of the octave (default 12).  Degrees 1–7 are
   *  the diatonic MOS from the EDO's best fifth; alterations move by EDO steps. */
  edo?: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

export function measureSlots(ts: MeasureTimeSig): number {
  return ts.num * (32 / ts.den);
}

export const KEY_NAMES: Record<number, string> = {
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
  "-1": "F", "-2": "Bb", "-3": "Eb", "-4": "Ab", "-5": "Db", "-6": "Gb", "-7": "Cb",
};

export const KEY_LABELS: Record<number, string> = {
  0: "C maj", 1: "G maj", 2: "D maj", 3: "A maj", 4: "E maj", 5: "B maj", 6: "F# maj", 7: "C# maj",
  "-1": "F maj", "-2": "Bb maj", "-3": "Eb maj", "-4": "Ab maj", "-5": "Db maj", "-6": "Gb maj", "-7": "Cb maj",
};

// Treble clef: lineIdx 0 = F5 (top staff line), steps of 0.5 going down.
// Offset of 4 maps lineIdx -2 → index 0.
const TREBLE_PITCHES: string[] = [
  "c/6", "b/5", "a/5", "g/5",   // lineIdx -2, -1.5, -1, -0.5
  "f/5", "e/5", "d/5", "c/5",   // lineIdx 0, 0.5, 1, 1.5
  "b/4", "a/4", "g/4", "f/4",   // lineIdx 2, 2.5, 3, 3.5
  "e/4", "d/4", "c/4", "b/3",   // lineIdx 4, 4.5, 5, 5.5
  "a/3", "g/3", "f/3", "e/3",   // lineIdx 6, 6.5, 7, 7.5
];

// Bass clef: lineIdx 0 = A3 (top staff line)
const BASS_PITCHES: string[] = [
  "e/4", "d/4", "c/4", "b/3",   // lineIdx -2, -1.5, -1, -0.5
  "a/3", "g/3", "f/3", "e/3",   // lineIdx 0, 0.5, 1, 1.5
  "d/3", "c/3", "b/2", "a/2",   // lineIdx 2, 2.5, 3, 3.5
  "g/2", "f/2", "e/2", "d/2",   // lineIdx 4, 4.5, 5, 5.5
  "c/2", "b/1", "a/1", "g/1",   // lineIdx 6, 6.5, 7, 7.5
];

export function linePosToPitch(lineIdx: number, clef: ClefType): string {
  const pitches = clef === "treble" ? TREBLE_PITCHES : BASS_PITCHES;
  const idx = Math.round(lineIdx * 2) + 4;
  return pitches[Math.max(0, Math.min(pitches.length - 1, idx))];
}

export function pitchToLineIdx(pitch: string, clef: ClefType): number {
  const pitches = clef === "treble" ? TREBLE_PITCHES : BASS_PITCHES;
  const idx = pitches.indexOf(pitch);
  if (idx < 0) return 2;
  return (idx - 4) / 2;
}

export function decomposeSlotsToRests(slots: number): Duration[] {
  const result: Duration[] = [];
  const order: [number, Duration][] = [
    [32, "w"], [16, "h"], [8, "q"], [4, "8"], [2, "16"], [1, "32"],
  ];
  let remaining = slots;
  for (const [size, dur] of order) {
    while (remaining >= size) {
      result.push(dur);
      remaining -= size;
    }
  }
  return result;
}

export interface RestSpec { dur: Duration; dotted: boolean; slots: number; }

// Like decomposeSlotsToRests but prefers dotted rests (e.g. dotted half instead
// of half + quarter) matching standard notation practice.
export function decomposeSlotsToRestSpecs(slots: number): RestSpec[] {
  const table: [number, Duration, boolean][] = [
    [32, "w",   false],
    [24, "h",   true ],
    [16, "h",   false],
    [12, "q",   true ],
    [8,  "q",   false],
    [6,  "8",   true ],
    [4,  "8",   false],
    [3,  "16",  true ],
    [2,  "16",  false],
    [1,  "32",  false],
  ];
  const result: RestSpec[] = [];
  let remaining = slots;
  for (const [size, dur, dotted] of table) {
    while (remaining >= size) {
      result.push({ dur, dotted, slots: size });
      remaining -= size;
    }
  }
  return result;
}

// ── Persistence ────────────────────────────────────────────────────────────────

const LS_KEY = "lt_note_entry_projects";

/** Reserved project id used by the Sol-fa Spectrum chord trainer's embedded
 *  Jianpu answer sheet.  Hidden from the Scoring project list. */
export const SOLFA_ANSWER_PROJECT_ID = "__solfa_spectrum_answer__";

export function loadProjects(): NoteEntryProject[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as NoteEntryProject[]) : [];
  } catch {
    return [];
  }
}

export function saveProject(project: NoteEntryProject): void {
  const all = loadProjects();
  const idx = all.findIndex(p => p.id === project.id);
  if (idx >= 0) all[idx] = project;
  else all.push(project);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function deleteProject(id: string): void {
  localStorage.setItem(LS_KEY, JSON.stringify(loadProjects().filter(p => p.id !== id)));
}

export function newProject(title: string, setup: ScoreSetup): NoteEntryProject {
  return {
    id: crypto.randomUUID(),
    title,
    setup,
    notes: [],
    syncPoints: [],
    youtubeUrl: "",
    createdAt: Date.now(),
  };
}

// ── MusicXML export ────────────────────────────────────────────────────────────

/** XML-escape a string so titles / composer names don't break the output. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Map a drum pitch (with optional notehead) to a notehead-shape token
 *  recognised by MusicXML readers (Sibelius, Finale, MuseScore). */
function drumNoteheadFor(pitch: string, notehead?: NoteheadType): string | null {
  if (notehead === "x") return "x";
  if (notehead === "circle-x") return "circle x";
  if (notehead === "diamond") return "diamond";
  // Heuristic: cymbal pitches (a/5, f/5) default to X if no notehead set.
  if (!notehead && (pitch.startsWith("a/5") || pitch.startsWith("f/5") || pitch.startsWith("d/4"))) return "x";
  return null;
}

export function generateMusicXML(project: NoteEntryProject): string {
  // Drum projects use a different export path: percussion clef and
  // <unpitched> notes instead of <pitch>, plus notehead glyphs for
  // cymbals.  Detect at the top so the rest of this function can stay
  // focused on harmonic notation.
  if (project.instrument === "drum") {
    return generateDrumMusicXML(project);
  }
  if (project.instrument === "jianpu") {
    return generateJianpuMusicXML(project);
  }

  const { setup, notes, title } = project;
  const { clef, keySignature, defaultTimeSig, barCount } = setup;

  const DIV = 8; // divisions per quarter note

  const durToInfo: Record<Duration, { type: string; dur: number }> = {
    "w":  { type: "whole",   dur: 32 },
    "h":  { type: "half",    dur: 16 },
    "q":  { type: "quarter", dur: 8  },
    "8":  { type: "eighth",  dur: 4  },
    "16": { type: "16th",    dur: 2  },
    "32": { type: "32nd",    dur: 1  },
  };

  const clefSign = clef === "bass" ? "F" : "G";
  const clefLine = clef === "bass" ? 4 : 2;

  function parsePitch(p: string): { step: string; octave: number } {
    const [s, o] = p.split("/");
    return { step: s.toUpperCase(), octave: parseInt(o) };
  }

  const safeTitle = xmlEscape(title);
  const composerLine = project.composer
    ? `\n  <identification><creator type="composer">${xmlEscape(project.composer)}</creator></identification>`
    : "";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${safeTitle}</work-title></work>${composerLine}
  <part-list>
    <score-part id="P1"><part-name>${safeTitle}</part-name></score-part>
  </part-list>
  <part id="P1">
`;

  for (let m = 0; m < barCount; m++) {
    const ts = setup.perBarTimeSig?.[m] ?? defaultTimeSig;
    const totalSlots = measureSlots(ts);
    const mNotes = notes
      .filter(n => n.measure === m)
      .sort((a, b) => a.startSlot - b.startSlot);

    xml += `    <measure number="${m + 1}">\n`;
    if (m === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${DIV}</divisions>\n`;
      xml += `        <key><fifths>${keySignature}</fifths></key>\n`;
      xml += `        <time><beats>${ts.num}</beats><beat-type>${ts.den}</beat-type></time>\n`;
      xml += `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>\n`;
      xml += `      </attributes>\n`;
    } else {
      const prevTs = setup.perBarTimeSig?.[m - 1] ?? defaultTimeSig;
      if (ts.num !== prevTs.num || ts.den !== prevTs.den) {
        xml += `      <attributes><time><beats>${ts.num}</beats><beat-type>${ts.den}</beat-type></time></attributes>\n`;
      }
    }

    const emitRest = (dur: Duration) => {
      const { type, dur: d } = durToInfo[dur];
      xml += `      <note><rest/><duration>${d}</duration><type>${type}</type></note>\n`;
    };

    let cursor = 0;
    for (let ni = 0; ni < mNotes.length; ni++) {
      const n = mNotes[ni];
      // Chord: 2nd+ pitched note at the same slot as the previous pitched note
      const prevPitched = ni > 0 ? mNotes.slice(0, ni).reverse().find(p => !p.isRest) : undefined;
      const isChord = !n.isRest && prevPitched && prevPitched.startSlot === n.startSlot;

      if (!isChord && n.startSlot > cursor) {
        decomposeSlotsToRests(n.startSlot - cursor).forEach(emitRest);
      }
      if (n.isRest) {
        emitRest(n.duration);
      } else {
        const { type, dur: d } = durToInfo[n.duration];
        const dotDur = n.dotted ? Math.round(d * 1.5) : d;
        const { step, octave } = parsePitch(n.pitch);
        xml += `      <note>\n`;
        if (isChord) xml += `        <chord/>\n`;
        xml += `        <pitch><step>${step}</step>`;
        if (n.accidental === "#") xml += `<alter>1</alter>`;
        if (n.accidental === "b") xml += `<alter>-1</alter>`;
        xml += `<octave>${octave}</octave></pitch>\n`;
        xml += `        <duration>${dotDur}</duration><type>${type}</type>${n.dotted ? "<dot/>" : ""}\n`;
        if (n.isTieStart) xml += `        <tie type="start"/>\n`;
        if (n.isTieEnd)   xml += `        <tie type="stop"/>\n`;
        if (n.bendSteps)  xml += `        <notations><technical><bend><bend-alter>${n.bendSteps}</bend-alter></bend></technical></notations>\n`;
        xml += `      </note>\n`;
      }
      if (!isChord) cursor = n.startSlot + noteSlots(n);
    }
    if (cursor < totalSlots) {
      decomposeSlotsToRests(totalSlots - cursor).forEach(emitRest);
    }

    xml += `    </measure>\n`;
  }

  xml += `  </part>\n</score-partwise>`;
  return xml;
}

/**
 * Two-part MusicXML for a jianpu score.  P1 = upper voice (right hand,
 * treble), P2 = lower voice (left hand, bass).  Notes carry standard
 * <pitch> derived from their degree/octave/accidental so any reader
 * (MuseScore, LilyPond, Dorico) — including tools with a jianpu view —
 * can render them.  Empty voices still emit a rest-filled part so the
 * "always two voices" layout is preserved on import.
 */
export function generateJianpuMusicXML(project: NoteEntryProject): string {
  const { setup, notes, title } = project;
  const { keySignature, defaultTimeSig, barCount } = setup;
  const DIV = 8;

  const durToInfo: Record<Duration, { type: string; dur: number }> = {
    "w":  { type: "whole",   dur: 32 },
    "h":  { type: "half",    dur: 16 },
    "q":  { type: "quarter", dur: 8  },
    "8":  { type: "eighth",  dur: 4  },
    "16": { type: "16th",    dur: 2  },
    "32": { type: "32nd",    dur: 1  },
  };

  const safeTitle = xmlEscape(title);
  const composerLine = project.composer
    ? `\n  <identification><creator type="composer">${xmlEscape(project.composer)}</creator></identification>`
    : "";

  // Convert a jianpu note to <pitch> using the same theory as the renderer.
  const pitchXml = (n: NoteData): string => {
    // Approximate the chromatic alteration as a 12-EDO accidental for export.
    const acc = n.alteration != null && n.alteration !== 0
      ? (n.alteration > 0 ? "#" : "b")
      : n.jianpuAccidental;
    const jp = jianpuToPitch(n.jianpuDegree ?? 1, n.jianpuOctave ?? 0, acc, keySignature);
    let s = `<pitch><step>${jp.step}</step>`;
    if (jp.alter) s += `<alter>${jp.alter}</alter>`;
    s += `<octave>${jp.octave}</octave></pitch>`;
    return s;
  };

  const voicePart = (voice: number, clefSign: string, clefLine: number): string => {
    let part = "";
    for (let m = 0; m < barCount; m++) {
      const ts = setup.perBarTimeSig?.[m] ?? defaultTimeSig;
      const totalSlots = measureSlots(ts);
      const mNotes = notes
        .filter(n => n.measure === m && (n.voice ?? 0) === voice)
        .sort((a, b) => a.startSlot - b.startSlot);

      part += `    <measure number="${m + 1}">\n`;
      if (m === 0) {
        part += `      <attributes>\n`;
        part += `        <divisions>${DIV}</divisions>\n`;
        part += `        <key><fifths>${keySignature}</fifths></key>\n`;
        part += `        <time><beats>${ts.num}</beats><beat-type>${ts.den}</beat-type></time>\n`;
        part += `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>\n`;
        part += `      </attributes>\n`;
      } else {
        const prevTs = setup.perBarTimeSig?.[m - 1] ?? defaultTimeSig;
        if (ts.num !== prevTs.num || ts.den !== prevTs.den) {
          part += `      <attributes><time><beats>${ts.num}</beats><beat-type>${ts.den}</beat-type></time></attributes>\n`;
        }
      }

      const emitRest = (dur: Duration) => {
        const { type, dur: d } = durToInfo[dur];
        part += `      <note><rest/><duration>${d}</duration><type>${type}</type></note>\n`;
      };

      let cursor = 0;
      for (const n of mNotes) {
        if (n.startSlot > cursor) decomposeSlotsToRests(n.startSlot - cursor).forEach(emitRest);
        if (n.isRest) {
          emitRest(n.duration);
        } else {
          const { type, dur: d } = durToInfo[n.duration];
          const dotDur = n.dotted ? Math.round(d * 1.5) : d;
          part += `      <note>\n`;
          part += `        ${pitchXml(n)}\n`;
          part += `        <duration>${dotDur}</duration><type>${type}</type>${n.dotted ? "<dot/>" : ""}\n`;
          part += `      </note>\n`;
        }
        cursor = n.startSlot + noteSlots(n);
      }
      if (cursor < totalSlots) decomposeSlotsToRests(totalSlots - cursor).forEach(emitRest);

      part += `    </measure>\n`;
    }
    return part;
  };

  // One part per voice line: voice 0 → treble (RH), the rest → bass.
  const maxVoice = notes.reduce((m, n) => Math.max(m, n.voice ?? 0), 0);
  const voiceCount = Math.max(2, project.voiceCount ?? 2, maxVoice + 1);
  const voiceName = (v: number) => v === 0 ? "Right hand" : voiceCount === 2 ? "Left hand" : `Voice ${v + 1}`;

  const scorePartsXml = Array.from({ length: voiceCount }, (_, v) =>
    `    <score-part id="P${v + 1}"><part-name>${voiceName(v)}</part-name></score-part>`).join("\n");
  // Join the voices with a piano grand-staff brace when requested.
  const partListXml = project.pianoBrace
    ? `    <part-group type="start" number="1"><group-symbol>brace</group-symbol><group-barline>yes</group-barline></part-group>\n${scorePartsXml}\n    <part-group type="stop" number="1"/>`
    : scorePartsXml;
  const partsXml = Array.from({ length: voiceCount }, (_, v) => {
    const clefSign = v === 0 ? "G" : "F";
    const clefLine = v === 0 ? 2 : 4;
    return `  <part id="P${v + 1}">\n${voicePart(v, clefSign, clefLine)}  </part>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${safeTitle}</work-title></work>${composerLine}
  <part-list>
${partListXml}
  </part-list>
${partsXml}
</score-partwise>`;
}

/** Drum-set MusicXML: percussion clef, <unpitched> notes with
 *  display-step / display-octave, notehead glyphs for cymbals.
 *  Works in MuseScore, Sibelius, Dorico, and Finale. */
function generateDrumMusicXML(project: NoteEntryProject): string {
  const { setup, notes, title } = project;
  const { defaultTimeSig, barCount } = setup;

  const DIV = 8;
  const durToInfo: Record<Duration, { type: string; dur: number }> = {
    "w":  { type: "whole",   dur: 32 },
    "h":  { type: "half",    dur: 16 },
    "q":  { type: "quarter", dur: 8  },
    "8":  { type: "eighth",  dur: 4  },
    "16": { type: "16th",    dur: 2  },
    "32": { type: "32nd",    dur: 1  },
  };

  const safeTitle = xmlEscape(title);
  const composerLine = project.composer
    ? `\n  <identification><creator type="composer">${xmlEscape(project.composer)}</creator></identification>`
    : "";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${safeTitle}</work-title></work>${composerLine}
  <part-list>
    <score-part id="P1">
      <part-name>Drum set</part-name>
      <part-abbreviation>D. set</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
`;

  for (let m = 0; m < barCount; m++) {
    const ts = setup.perBarTimeSig?.[m] ?? defaultTimeSig;
    const totalSlots = measureSlots(ts);
    const mNotes = notes
      .filter(n => n.measure === m)
      .sort((a, b) => a.startSlot - b.startSlot);

    xml += `    <measure number="${m + 1}">\n`;
    if (m === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${DIV}</divisions>\n`;
      xml += `        <time><beats>${ts.num}</beats><beat-type>${ts.den}</beat-type></time>\n`;
      xml += `        <clef><sign>percussion</sign><line>2</line></clef>\n`;
      xml += `        <staff-details><staff-lines>5</staff-lines></staff-details>\n`;
      xml += `      </attributes>\n`;
    } else {
      const prevTs = setup.perBarTimeSig?.[m - 1] ?? defaultTimeSig;
      if (ts.num !== prevTs.num || ts.den !== prevTs.den) {
        xml += `      <attributes><time><beats>${ts.num}</beats><beat-type>${ts.den}</beat-type></time></attributes>\n`;
      }
    }

    const title = setup.perBarTitle?.[m];
    if (title) {
      xml += `      <direction placement="above"><direction-type><words>${xmlEscape(title)}</words></direction-type></direction>\n`;
    }

    const emitRest = (dur: Duration) => {
      const { type, dur: d } = durToInfo[dur];
      xml += `      <note><rest/><duration>${d}</duration><type>${type}</type></note>\n`;
    };

    let cursor = 0;
    for (let ni = 0; ni < mNotes.length; ni++) {
      const n = mNotes[ni];
      const prevPitched = ni > 0 ? mNotes.slice(0, ni).reverse().find(p => !p.isRest) : undefined;
      const isChord = !n.isRest && prevPitched && prevPitched.startSlot === n.startSlot;

      if (!isChord && n.startSlot > cursor) {
        decomposeSlotsToRests(n.startSlot - cursor).forEach(emitRest);
      }
      if (n.isRest) {
        emitRest(n.duration);
      } else {
        const { type, dur: d } = durToInfo[n.duration];
        const dotDur = n.dotted ? Math.round(d * 1.5) : d;
        const [step, oct] = n.pitch.split("/");
        const displayStep = step.toUpperCase();
        const displayOct = parseInt(oct, 10);
        const headTok = drumNoteheadFor(n.pitch, n.notehead);
        xml += `      <note>\n`;
        if (isChord) xml += `        <chord/>\n`;
        xml += `        <unpitched>\n`;
        xml += `          <display-step>${displayStep}</display-step>\n`;
        xml += `          <display-octave>${displayOct}</display-octave>\n`;
        xml += `        </unpitched>\n`;
        xml += `        <duration>${dotDur}</duration>\n`;
        xml += `        <type>${type}</type>${n.dotted ? "<dot/>" : ""}\n`;
        if (headTok) xml += `        <notehead>${headTok}</notehead>\n`;
        // Articulations / stem stickings live under <notations>.
        const notationParts: string[] = [];
        if (n.articulation === "accent") {
          notationParts.push(`<articulations><accent/></articulations>`);
        }
        if (n.articulation === "ghost") {
          notationParts.push(`<notehead-text><display-text>(${displayStep})</display-text></notehead-text>`);
        }
        if (n.stick) {
          notationParts.push(`<technical><other-technical>${n.stick}</other-technical></technical>`);
        }
        if (notationParts.length) {
          xml += `        <notations>${notationParts.join("")}</notations>\n`;
        }
        xml += `      </note>\n`;
      }
      if (!isChord) cursor = n.startSlot + noteSlots(n);
    }
    if (cursor < totalSlots) {
      decomposeSlotsToRests(totalSlots - cursor).forEach(emitRest);
    }

    xml += `    </measure>\n`;
  }

  xml += `  </part>\n</score-partwise>`;
  return xml;
}
