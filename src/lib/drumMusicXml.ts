// ── MusicXML export for Drum Ostinato & Accent Study ──────────────────────────
//
// Generates valid MusicXML 3.1 percussion parts.
// Handles: multi-voice (up/down stem), grace notes (flams), tremolo marks
// (doubles & buzz rolls), accents, ghost notes, stickings, open/closed hi-hat.

import {
  GridType, GRID_SUBDIVS, DrumMeasure,
  getPerms, permHits, resolveSnareHits, resolveBassHits, resolveGhostHits,
} from "./drumData";
import type { AccentMeasureData, AccentSubdivision } from "./accentData";
import { toRenderGrid, ACCENT_SUBDIV_BEAT_SLOTS } from "./accentData";

// ── Instrument definitions ──────────────────────────────────────────────────

interface DrumInst {
  id: string;
  name: string;
  midi: number;
  step: string;
  octave: number;
  notehead?: string; // "x" | "circle-x" | "normal"
}

const INST: Record<string, DrumInst> = {
  "hh-closed":  { id: "P1-I1", name: "Closed Hi-Hat",  midi: 42, step: "G", octave: 5, notehead: "x" },
  "hh-open":    { id: "P1-I2", name: "Open Hi-Hat",    midi: 46, step: "G", octave: 5, notehead: "circle-x" },
  snare:        { id: "P1-I3", name: "Snare",           midi: 38, step: "C", octave: 5 },
  ghost:        { id: "P1-I4", name: "Ghost Note",      midi: 38, step: "C", octave: 5 },
  tom:          { id: "P1-I5", name: "High Tom",        midi: 50, step: "E", octave: 5 },
  bass:         { id: "P1-I6", name: "Bass Drum",       midi: 36, step: "F", octave: 4 },
  "hh-pedal":   { id: "P1-I7", name: "Hi-Hat Pedal",    midi: 44, step: "D", octave: 4, notehead: "x" },
};

// ── Duration helpers ────────────────────────────────────────────────────────

interface XmlDur {
  duration: number;
  type: string;
  dot?: boolean;
  timeMod?: { actual: number; normal: number; normalType: string };
}

function isTupletGrid(beatSize: number): boolean {
  return beatSize === 3 || beatSize === 5 || beatSize === 7;
}

function baseNoteType(beatSize: number): string {
  if (beatSize === 2) return "eighth";
  if (beatSize === 3) return "eighth";
  if (beatSize === 4) return "16th";
  if (beatSize === 5) return "16th";
  if (beatSize === 7) return "16th";
  if (beatSize === 8) return "32nd";
  return "16th";
}

function tupletTimeMod(beatSize: number): { actual: number; normal: number; normalType: string } | undefined {
  if (beatSize === 3) return { actual: 3, normal: 2, normalType: "eighth" };
  if (beatSize === 5) return { actual: 5, normal: 4, normalType: "16th" };
  if (beatSize === 7) return { actual: 7, normal: 4, normalType: "16th" };
  return undefined;
}

/** Decompose a number of slots into MusicXML note durations. */
function decomposeSlots(slots: number, beatSize: number): XmlDur[] {
  const result: XmlDur[] = [];
  let rem = slots;

  // Beat-aligned values (quarter notes and above) — always valid
  const beatTable: [number, string, boolean][] = [
    [beatSize * 4, "whole", false],
    [beatSize * 3, "half", true],
    [beatSize * 2, "half", false],
  ];
  // Dotted quarter: 1.5 beats (only integer slots)
  const dq = beatSize * 1.5;
  if (dq === Math.floor(dq)) beatTable.push([dq, "quarter", true]);
  beatTable.push([beatSize, "quarter", false]);

  for (const [s, type, dot] of beatTable) {
    while (rem >= s) {
      result.push({ duration: s, type, dot: dot || undefined });
      rem -= s;
    }
  }

  // Sub-beat values
  if (rem > 0) {
    if (isTupletGrid(beatSize)) {
      const bt = baseNoteType(beatSize);
      const tm = tupletTimeMod(beatSize);
      while (rem > 0) {
        result.push({ duration: 1, type: bt, timeMod: tm });
        rem--;
      }
    } else {
      // Standard sub-beat decomposition
      const subTable: [number, string, boolean][] = [];
      if (beatSize >= 8) {
        subTable.push([6, "eighth", true], [4, "eighth", false], [3, "16th", true], [2, "16th", false], [1, "32nd", false]);
      } else if (beatSize >= 4) {
        subTable.push([3, "eighth", true], [2, "eighth", false], [1, "16th", false]);
      } else {
        subTable.push([1, "eighth", false]);
      }
      for (const [s, type, dot] of subTable) {
        while (rem >= s) {
          result.push({ duration: s, type, dot: dot || undefined });
          rem -= s;
        }
      }
    }
  }

  return result;
}

// ── XML helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function noteXml(
  inst: DrumInst,
  dur: XmlDur,
  voice: number,
  stem: string,
  opts?: {
    chord?: boolean;
    rest?: boolean;
    isAccent?: boolean;
    isFlam?: boolean;
    isDouble?: boolean;
    isBuzz?: boolean;
    isGhost?: boolean;
  },
): string {
  const lines: string[] = [];
  const o = opts ?? {};

  // Grace note for flam (emitted as a separate <note> BEFORE this one)
  // Handled externally — this function only emits the main note.

  lines.push("      <note>");
  if (o.chord) lines.push("        <chord/>");

  if (o.rest) {
    lines.push("        <rest/>");
  } else {
    lines.push("        <unpitched>");
    lines.push(`          <display-step>${inst.step}</display-step>`);
    lines.push(`          <display-octave>${inst.octave}</display-octave>`);
    lines.push("        </unpitched>");
    lines.push(`        <instrument id="${inst.id}"/>`);
  }

  lines.push(`        <duration>${dur.duration}</duration>`);
  lines.push(`        <voice>${voice}</voice>`);
  lines.push(`        <type>${dur.type}</type>`);
  if (dur.dot) lines.push("        <dot/>");
  lines.push(`        <stem>${stem}</stem>`);

  if (dur.timeMod) {
    lines.push("        <time-modification>");
    lines.push(`          <actual-notes>${dur.timeMod.actual}</actual-notes>`);
    lines.push(`          <normal-notes>${dur.timeMod.normal}</normal-notes>`);
    lines.push(`          <normal-type>${dur.timeMod.normalType}</normal-type>`);
    lines.push("        </time-modification>");
  }

  // Notehead
  if (!o.rest) {
    if (o.isGhost) {
      lines.push('        <notehead parentheses="yes">normal</notehead>');
    } else if (inst.notehead === "x") {
      lines.push("        <notehead>x</notehead>");
    } else if (inst.notehead === "circle-x") {
      lines.push("        <notehead>circle-x</notehead>");
    }
  }

  // Notations: accent, tremolo (double/buzz)
  const notations: string[] = [];
  if (o.isAccent) {
    notations.push("          <articulations><accent/></articulations>");
  }
  if (o.isDouble) {
    notations.push('          <ornaments><tremolo type="single">1</tremolo></ornaments>');
  }
  if (o.isBuzz) {
    notations.push('          <ornaments><tremolo type="single">3</tremolo></ornaments>');
  }
  if (notations.length > 0) {
    lines.push("        <notations>");
    lines.push(...notations);
    lines.push("        </notations>");
  }

  lines.push("      </note>");
  return lines.join("\n");
}

function graceNoteXml(inst: DrumInst, voice: number, stem: string): string {
  return [
    "      <note>",
    "        <grace slash=\"yes\"/>",
    "        <unpitched>",
    `          <display-step>${inst.step}</display-step>`,
    `          <display-octave>${inst.octave}</display-octave>`,
    "        </unpitched>",
    `        <instrument id="${inst.id}"/>`,
    `        <voice>${voice}</voice>`,
    "        <type>16th</type>",
    `        <stem>${stem}</stem>`,
    "      </note>",
  ].join("\n");
}

function restXml(dur: XmlDur, voice: number, stem: string): string {
  const lines = [
    "      <note>",
    "        <rest/>",
    `        <duration>${dur.duration}</duration>`,
    `        <voice>${voice}</voice>`,
    `        <type>${dur.type}</type>`,
  ];
  if (dur.dot) lines.push("        <dot/>");
  lines.push(`        <stem>${stem}</stem>`);
  if (dur.timeMod) {
    lines.push("        <time-modification>");
    lines.push(`          <actual-notes>${dur.timeMod.actual}</actual-notes>`);
    lines.push(`          <normal-notes>${dur.timeMod.normal}</normal-notes>`);
    lines.push(`          <normal-type>${dur.timeMod.normalType}</normal-type>`);
    lines.push("        </time-modification>");
  }
  lines.push("      </note>");
  return lines.join("\n");
}

// ── Voice event building ────────────────────────────────────────────────────

interface VoiceEvent {
  slot: number;
  instruments: { inst: DrumInst; isChord: boolean; isAccent?: boolean; isFlam?: boolean; isDouble?: boolean; isBuzz?: boolean; isGhost?: boolean }[];
  nextSlot: number; // slot of the next event (or measure end)
}

function buildVoiceEvents(
  slotCount: number,
  hitSets: { inst: DrumInst; hits: number[]; isAccent?: (s: number) => boolean; isFlam?: (s: number) => boolean; isDouble?: (s: number) => boolean; isBuzz?: (s: number) => boolean; isGhost?: boolean }[],
): VoiceEvent[] {
  // Collect all hit slots
  const slotMap = new Map<number, VoiceEvent["instruments"]>();
  for (const hs of hitSets) {
    for (const s of hs.hits.filter(s => s < slotCount)) {
      if (!slotMap.has(s)) slotMap.set(s, []);
      slotMap.get(s)!.push({
        inst: hs.inst,
        isChord: false,
        isAccent: hs.isAccent?.(s),
        isFlam: hs.isFlam?.(s),
        isDouble: hs.isDouble?.(s),
        isBuzz: hs.isBuzz?.(s),
        isGhost: hs.isGhost,
      });
    }
  }

  const sortedSlots = [...slotMap.keys()].sort((a, b) => a - b);
  const events: VoiceEvent[] = [];
  for (let i = 0; i < sortedSlots.length; i++) {
    const slot = sortedSlots[i];
    const instruments = slotMap.get(slot)!;
    // Mark chord notes (2nd+ at same slot)
    instruments.forEach((inst, idx) => { inst.isChord = idx > 0; });
    events.push({
      slot,
      instruments,
      nextSlot: i + 1 < sortedSlots.length ? sortedSlots[i + 1] : slotCount,
    });
  }
  return events;
}

function voiceToXml(
  events: VoiceEvent[],
  slotCount: number,
  beatSize: number,
  voice: number,
  stem: string,
  stickingMap?: Map<number, string>,
): string {
  const parts: string[] = [];
  let cursor = 0;

  for (const ev of events) {
    // Rest before this event
    if (ev.slot > cursor) {
      for (const rd of decomposeSlots(ev.slot - cursor, beatSize)) {
        parts.push(restXml(rd, voice, stem));
      }
    }

    const noteDur = ev.nextSlot - ev.slot;
    const durs = decomposeSlots(noteDur, beatSize);

    // Sticking direction
    if (stickingMap?.has(ev.slot)) {
      parts.push(`      <direction placement="below"><direction-type><words font-size="7">${stickingMap.get(ev.slot)}</words></direction-type></direction>`);
    }

    // Main notes for first duration
    for (const instInfo of ev.instruments) {
      // Flam: emit grace note before main note
      if (instInfo.isFlam) {
        parts.push(graceNoteXml(INST.snare, voice, stem));
      }
      parts.push(noteXml(instInfo.inst, durs[0], voice, stem, {
        chord: instInfo.isChord,
        isAccent: instInfo.isAccent,
        isDouble: instInfo.isDouble,
        isBuzz: instInfo.isBuzz,
        isGhost: instInfo.isGhost,
      }));
    }

    // Trailing durations as rests (pad the note's total duration)
    for (let d = 1; d < durs.length; d++) {
      parts.push(restXml(durs[d], voice, stem));
    }

    cursor = ev.nextSlot;
  }

  // Trailing rest
  if (cursor < slotCount) {
    for (const rd of decomposeSlots(slotCount - cursor, beatSize)) {
      parts.push(restXml(rd, voice, stem));
    }
  }

  return parts.join("\n");
}

// ── Part-list XML ───────────────────────────────────────────────────────────

function partListXml(title: string, usedInsts: DrumInst[]): string {
  const lines = [
    '  <part-list>',
    `    <score-part id="P1">`,
    `      <part-name>${esc(title)}</part-name>`,
  ];
  for (const inst of usedInsts) {
    lines.push(`      <score-instrument id="${inst.id}"><instrument-name>${esc(inst.name)}</instrument-name></score-instrument>`);
  }
  for (const inst of usedInsts) {
    lines.push(`      <midi-instrument id="${inst.id}"><midi-unpitched>${inst.midi + 1}</midi-unpitched></midi-instrument>`);
  }
  lines.push("    </score-part>");
  lines.push("  </part-list>");
  return lines.join("\n");
}

// ── Open-hit resolver (same logic as DrumPatterns) ──────────────────────────

function getOpenHits(allHits: number[], openSlots: boolean[], beatSize: number): number[] {
  const result: number[] = [];
  for (let slot = 0; slot < beatSize; slot++) {
    if (openSlots[slot]) {
      for (let beat = 0; beat < 4; beat++) {
        const pos = slot + beat * beatSize;
        if (allHits.includes(pos)) result.push(pos);
      }
    }
  }
  return result;
}

// ── Drum Ostinato MusicXML ──────────────────────────────────────────────────

export function generateDrumOstinatoXML(
  title: string,
  measures: DrumMeasure[],
  grid: GridType,
): string {
  const subdivs = GRID_SUBDIVS[grid];
  const beatSize = subdivs / 4;
  const divisions = beatSize;

  // Collect all used instruments
  const usedSet = new Set<string>();
  // Always include these
  usedSet.add("hh-closed");
  usedSet.add("snare");
  usedSet.add("bass");

  const allUsedInsts: DrumInst[] = [];
  const addInst = (key: string) => {
    if (!usedSet.has(key)) { usedSet.add(key); }
  };

  // Pre-scan for which instruments are used
  const perms = getPerms(grid);
  for (const m of measures) {
    if (m.hhOpenPermId) addInst("hh-pedal");
    if (m.ghostPermId) { addInst("ghost"); if (m.ghostDoubleSlots?.some(Boolean)) addInst("ghost"); }
    // Check for open hi-hat
    const oPerm = m.hhClosedPermId ? perms.find(p => p.id === m.hhClosedPermId) : null;
    const oHits = oPerm ? permHits(oPerm, grid) : [];
    const oOpen = getOpenHits(oHits, m.ostinatoOpenSlots ?? [], beatSize);
    if (oOpen.length > 0) addInst("hh-open");
  }

  for (const key of ["hh-closed", "hh-open", "snare", "ghost", "tom", "bass", "hh-pedal"]) {
    if (usedSet.has(key)) allUsedInsts.push(INST[key]);
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
${partListXml(title || "Drum Ostinato", allUsedInsts)}
  <part id="P1">
`;

  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi];

    // Resolve hits
    const oPerm = m.hhClosedPermId ? perms.find(p => p.id === m.hhClosedPermId) : null;
    const oHits = oPerm ? permHits(oPerm, grid) : [];
    const oOpen = new Set(getOpenHits(oHits, m.ostinatoOpenSlots ?? [], beatSize));

    const sHits = resolveSnareHits(m, grid);
    const bHits = resolveBassHits(m, grid);
    const gHits = resolveGhostHits(m, grid);

    const hPerm = m.hhOpenPermId ? perms.find(p => p.id === m.hhOpenPermId) : null;
    const hHits = hPerm ? permHits(hPerm, grid) : [];
    const hOpen = new Set(getOpenHits(hHits, m.hhFootOpenSlots ?? [], beatSize));

    const gDoubleSet = new Set<number>();
    if (m.ghostDoubleSlots?.length) {
      gHits.forEach(s => {
        const bs = s % beatSize;
        if (m.ghostDoubleSlots![bs]) gDoubleSet.add(s);
      });
    }

    // Build voice 1 (up-stem): ostinato closed, ostinato open, snare, ghost
    const upHitSets = [];

    // Ostinato: split into closed and open
    const oClosed = oHits.filter(s => !oOpen.has(s));
    const oOpenArr = oHits.filter(s => oOpen.has(s));
    if (oClosed.length > 0) upHitSets.push({ inst: INST["hh-closed"], hits: oClosed });
    if (oOpenArr.length > 0) upHitSets.push({ inst: INST["hh-open"], hits: oOpenArr });
    if (sHits.length > 0) upHitSets.push({ inst: INST.snare, hits: sHits });
    if (gHits.length > 0) upHitSets.push({
      inst: INST.ghost, hits: gHits, isGhost: true,
      isDouble: (s: number) => gDoubleSet.has(s),
    });

    const upEvents = buildVoiceEvents(subdivs, upHitSets);

    // Build voice 2 (down-stem): bass, hh pedal
    const downHitSets = [];
    if (bHits.length > 0) downHitSets.push({ inst: INST.bass, hits: bHits });
    if (hHits.length > 0) {
      const hClosed = hHits.filter(s => !hOpen.has(s));
      const hOpenArr = hHits.filter(s => hOpen.has(s));
      if (hClosed.length > 0) downHitSets.push({ inst: INST["hh-pedal"], hits: hClosed });
      if (hOpenArr.length > 0) downHitSets.push({ inst: { ...INST["hh-pedal"], notehead: "circle-x" }, hits: hOpenArr });
    }
    const downEvents = buildVoiceEvents(subdivs, downHitSets);

    xml += `    <measure number="${mi + 1}">\n`;
    if (mi === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${divisions}</divisions>\n`;
      xml += `        <time><beats>4</beats><beat-type>4</beat-type></time>\n`;
      xml += `        <clef><sign>percussion</sign></clef>\n`;
      xml += `      </attributes>\n`;
    }

    // Voice 1
    xml += voiceToXml(upEvents, subdivs, beatSize, 1, "up") + "\n";

    // Backup to start for voice 2
    if (downEvents.length > 0) {
      xml += `      <backup><duration>${subdivs}</duration></backup>\n`;
      xml += voiceToXml(downEvents, subdivs, beatSize, 2, "down") + "\n";
    }

    xml += `    </measure>\n`;
  }

  xml += "  </part>\n</score-partwise>";
  return xml;
}

// ── Accent Study MusicXML ───────────────────────────────────────────────────

export function generateAccentStudyXML(
  title: string,
  measures: AccentMeasureData[],
  subdivision: AccentSubdivision,
  beats: number,
): string {
  const grid = toRenderGrid(subdivision);
  const beatSlots = ACCENT_SUBDIV_BEAT_SLOTS[subdivision];
  const totalSlots = beatSlots * beats;
  const beatSize = beatSlots;
  const divisions = beatSize;

  const usedInsts = [INST.snare, INST.ghost, INST.bass, INST.tom];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
${partListXml(title || "Accent Study", usedInsts)}
  <part id="P1">
`;

  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi];
    const slotCount = m.displaySlots ?? totalSlots;
    const mBeats = Math.max(1, Math.round(slotCount / beatSlots));

    const accentSet = new Set<number>();
    (m.accentFlags ?? []).forEach((f, i) => { if (f && i < slotCount) accentSet.add(i); });

    const acInterp = m.accentInterpretation;
    const tapInterp = m.tapInterpretation;
    const ghostSet = new Set(m.ghostHits.filter(s => s < slotCount));
    const snareSet = new Set(m.snareHits.filter(s => s < slotCount));

    const stickingMap = new Map<number, string>();
    (m.stickings ?? []).forEach((s, i) => { if (s && i < slotCount) stickingMap.set(i, s); });

    // Up-stem: snare + ghost + tom
    const upHitSets: Parameters<typeof buildVoiceEvents>[1] = [];

    if (m.snareHits.length > 0) {
      upHitSets.push({
        inst: INST.snare, hits: m.snareHits,
        isAccent: (s: number) => accentSet.has(s),
        isFlam: (s: number) => accentSet.has(s) && acInterp === "accent-flam",
        isDouble: (s: number) => {
          if (accentSet.has(s) && acInterp === "accent-double") return true;
          return false;
        },
        isBuzz: (s: number) => accentSet.has(s) && acInterp === "accent-buzz",
      });
    }

    if (m.ghostHits.length > 0) {
      upHitSets.push({
        inst: INST.ghost, hits: m.ghostHits, isGhost: true,
        isFlam: (s: number) => {
          const isGhostOnly = ghostSet.has(s) && !snareSet.has(s);
          return isGhostOnly && tapInterp === "tap-flam";
        },
        isDouble: (s: number) => {
          const isGhostOnly = ghostSet.has(s) && !snareSet.has(s);
          return isGhostOnly && tapInterp === "tap-double";
        },
        isBuzz: (s: number) => {
          const isGhostOnly = ghostSet.has(s) && !snareSet.has(s);
          return isGhostOnly && tapInterp === "tap-buzz";
        },
      });
    }

    if (m.tomHits && m.tomHits.length > 0) {
      upHitSets.push({
        inst: INST.tom, hits: m.tomHits,
        isAccent: (s: number) => accentSet.has(s),
      });
    }

    const upEvents = buildVoiceEvents(slotCount, upHitSets);

    // Down-stem: bass
    const downHitSets: Parameters<typeof buildVoiceEvents>[1] = [];
    if (m.bassHits.length > 0) {
      downHitSets.push({ inst: INST.bass, hits: m.bassHits });
    }
    const downEvents = buildVoiceEvents(slotCount, downHitSets);

    xml += `    <measure number="${mi + 1}">\n`;
    if (mi === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${divisions}</divisions>\n`;
      xml += `        <time><beats>${mBeats}</beats><beat-type>4</beat-type></time>\n`;
      xml += `        <clef><sign>percussion</sign></clef>\n`;
      xml += `      </attributes>\n`;
    } else {
      // Check if this measure has a different beat count
      const prevSlots = measures[mi - 1].displaySlots ?? totalSlots;
      const prevBeats = Math.max(1, Math.round(prevSlots / beatSlots));
      if (mBeats !== prevBeats) {
        xml += `      <attributes><time><beats>${mBeats}</beats><beat-type>4</beat-type></time></attributes>\n`;
      }
    }

    // Voice 1
    xml += voiceToXml(upEvents, slotCount, beatSize, 1, "up", stickingMap) + "\n";

    // Backup + Voice 2
    if (downEvents.length > 0) {
      xml += `      <backup><duration>${slotCount}</duration></backup>\n`;
      xml += voiceToXml(downEvents, slotCount, beatSize, 2, "down") + "\n";
    }

    xml += `    </measure>\n`;
  }

  xml += "  </part>\n</score-partwise>";
  return xml;
}
