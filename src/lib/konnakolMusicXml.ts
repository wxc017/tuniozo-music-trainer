// ── MusicXML export for Konnakol patterns ────────────────────────────────────
//
// Generates rhythm-only MusicXML with text annotations (syllables) for
// konnakol subdivision and cycle patterns.

import type { KonnakolGroup } from "./konnakolData";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface NoteSpec {
  duration: number;  // in divisions
  type: string;
  dot?: boolean;
  rest?: boolean;
  tie?: "start" | "stop" | "both";
  syllable?: string;
  accent?: boolean;
  timeMod?: { actual: number; normal: number; normalType: string };
}

/**
 * Convert KonnakolGroup[] into a flat list of NoteSpec.
 * Each group is rendered as a tuplet (n notes in the time of the beat).
 * Standard 4-note groups are regular 16th notes; others get time-modification.
 */
function groupsToNoteSpecs(groups: KonnakolGroup[], beatsPerMeasure: number): NoteSpec[] {
  const specs: NoteSpec[] = [];

  for (const group of groups) {
    const subdiv = group.subdivision;
    // Determine time-modification for non-standard subdivisions
    let timeMod: NoteSpec["timeMod"];
    let baseType: string;
    let baseDur: number; // duration in our division units

    // We'll use divisions = LCM of common subdivisions
    // With divisions = 4 per quarter: each 16th = 1 division
    // Standard: subdiv=4 → 16th notes, no time-mod
    // Triplet:  subdiv=3 → 8th notes with time-mod 3:2
    // Others:   subdiv=N → 16th notes with time-mod N:4

    if (subdiv === 1) {
      // Single note per beat — use quarter note duration
      // Duration in note.duration field if set
      baseType = "quarter";
      baseDur = 4; // quarter = 4 divisions
    } else if (subdiv === 2) {
      baseType = "eighth";
      baseDur = 2;
    } else if (subdiv === 3) {
      baseType = "eighth";
      baseDur = 2; // would be 1.33 but we use time-mod
      timeMod = { actual: 3, normal: 2, normalType: "eighth" };
      // Actual duration per note = 4/3 divisions ≈ need higher division
      // We'll handle this by using divisions=12 (LCM of 3,4)
    } else if (subdiv === 4) {
      baseType = "16th";
      baseDur = 1;
    } else if (subdiv === 5) {
      baseType = "16th";
      baseDur = 1;
      timeMod = { actual: 5, normal: 4, normalType: "16th" };
    } else if (subdiv === 6) {
      baseType = "16th";
      baseDur = 1;
      timeMod = { actual: 6, normal: 4, normalType: "16th" };
    } else if (subdiv === 7) {
      baseType = "16th";
      baseDur = 1;
      timeMod = { actual: 7, normal: 4, normalType: "16th" };
    } else if (subdiv === 8) {
      baseType = "32nd";
      baseDur = 1;
      // 8 per beat = 32nd notes (with divisions=8)
    } else {
      baseType = "16th";
      baseDur = 1;
      timeMod = { actual: subdiv, normal: 4, normalType: "16th" };
    }

    for (const note of group.notes) {
      if (note.noteType === "rest") {
        specs.push({ duration: baseDur, type: baseType, rest: true, timeMod });
      } else if (note.noteType === "tie") {
        // Tie continues from previous note
        if (specs.length > 0 && !specs[specs.length - 1].rest) {
          const prev = specs[specs.length - 1];
          if (!prev.tie) prev.tie = "start";
          else if (prev.tie === "stop") prev.tie = "both";
        }
        specs.push({
          duration: baseDur, type: baseType, tie: "stop",
          syllable: note.syllable, timeMod,
        });
      } else {
        specs.push({
          duration: baseDur, type: baseType,
          syllable: note.syllable,
          accent: note.accent,
          timeMod,
          tie: note.isTieStart ? "start" : undefined,
        });
      }
    }
  }

  return specs;
}

export function generateKonnakolXML(title: string, groups: KonnakolGroup[], beatsPerMeasure = 4): string {
  if (groups.length === 0) return "";

  // Use divisions = 4 per quarter (handles 16th notes natively)
  // For triplets and other tuplets, use time-modification
  const divisions = 4;
  const totalDivisions = beatsPerMeasure * divisions;

  const specs = groupsToNoteSpecs(groups, beatsPerMeasure);

  // Split into measures
  const measuresSpecs: NoteSpec[][] = [];
  let currentMeasure: NoteSpec[] = [];
  let measureDur = 0;

  for (const spec of specs) {
    if (measureDur + spec.duration > totalDivisions && currentMeasure.length > 0) {
      measuresSpecs.push(currentMeasure);
      currentMeasure = [];
      measureDur = 0;
    }
    currentMeasure.push(spec);
    measureDur += spec.duration;
    if (measureDur >= totalDivisions) {
      measuresSpecs.push(currentMeasure);
      currentMeasure = [];
      measureDur = 0;
    }
  }
  if (currentMeasure.length > 0) measuresSpecs.push(currentMeasure);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>${esc(title || "Konnakol")}</part-name></score-part>
  </part-list>
  <part id="P1">
`;

  for (let mi = 0; mi < measuresSpecs.length; mi++) {
    const mSpecs = measuresSpecs[mi];
    xml += `    <measure number="${mi + 1}">\n`;

    if (mi === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${divisions}</divisions>\n`;
      xml += `        <time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>\n`;
      xml += `        <clef><sign>percussion</sign></clef>\n`;
      xml += `      </attributes>\n`;
    }

    for (const spec of mSpecs) {
      // Lyric / syllable as direction
      if (spec.syllable && !spec.rest) {
        xml += `      <direction placement="below"><direction-type><words font-size="8">${esc(spec.syllable)}</words></direction-type></direction>\n`;
      }

      xml += "      <note>\n";
      if (spec.rest) {
        xml += "        <rest/>\n";
      } else {
        xml += "        <unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>\n";
      }
      xml += `        <duration>${spec.duration}</duration>\n`;
      xml += "        <voice>1</voice>\n";
      xml += `        <type>${spec.type}</type>\n`;
      if (spec.dot) xml += "        <dot/>\n";
      xml += "        <stem>up</stem>\n";

      if (spec.timeMod) {
        xml += "        <time-modification>\n";
        xml += `          <actual-notes>${spec.timeMod.actual}</actual-notes>\n`;
        xml += `          <normal-notes>${spec.timeMod.normal}</normal-notes>\n`;
        xml += `          <normal-type>${spec.timeMod.normalType}</normal-type>\n`;
        xml += "        </time-modification>\n";
      }

      // Notations
      const notations: string[] = [];
      if (spec.tie === "start" || spec.tie === "both") notations.push('          <tied type="start"/>');
      if (spec.tie === "stop" || spec.tie === "both") notations.push('          <tied type="stop"/>');
      if (spec.accent) notations.push("          <articulations><accent/></articulations>");
      if (notations.length > 0) {
        xml += "        <notations>\n" + notations.join("\n") + "\n        </notations>\n";
      }

      // Tie notation attribute
      if (spec.tie === "start") xml += '        <tie type="start"/>\n';
      if (spec.tie === "stop") xml += '        <tie type="stop"/>\n';
      if (spec.tie === "both") {
        xml += '        <tie type="stop"/>\n';
        xml += '        <tie type="start"/>\n';
      }

      xml += "      </note>\n";
    }

    // Fill remaining space with rests
    const usedDur = mSpecs.reduce((sum, s) => sum + s.duration, 0);
    if (usedDur < totalDivisions) {
      const gap = totalDivisions - usedDur;
      // Simple rest fill
      const restTable: [number, string][] = [
        [16, "whole"], [8, "half"], [4, "quarter"], [2, "eighth"], [1, "16th"],
      ];
      let remGap = gap;
      for (const [d, t] of restTable) {
        while (remGap >= d) {
          xml += `      <note><rest/><duration>${d}</duration><voice>1</voice><type>${t}</type><stem>up</stem></note>\n`;
          remGap -= d;
        }
      }
    }

    xml += `    </measure>\n`;
  }

  xml += "  </part>\n</score-partwise>";
  return xml;
}
