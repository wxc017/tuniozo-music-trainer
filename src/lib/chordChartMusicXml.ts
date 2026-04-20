// ── MusicXML export for Chord Charts ─────────────────────────────────────────
//
// Generates MusicXML with chord symbols over rhythm-slash notation.

interface Bar {
  timeSig: string;
  beats: number;
  chords: string[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Parse a chord name into root + kind for MusicXML <harmony>.
 * E.g. "Cmaj7" → { root: "C", kind: "major-seventh" }
 *      "F#m"   → { root: "F", alter: 1, kind: "minor" }
 */
function parseChord(name: string): { root: string; alter?: number; kind: string; bass?: string; bassAlter?: number; text: string } | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "%" || trimmed === "-") return null;

  // Match root note
  const rootMatch = trimmed.match(/^([A-Ga-g])(#{1,2}|b{1,2}|♯|♭)?/);
  if (!rootMatch) return { root: "C", kind: "major", text: trimmed };

  const rootLetter = rootMatch[1].toUpperCase();
  const accStr = rootMatch[2] ?? "";
  let alter = 0;
  if (accStr === "#" || accStr === "♯") alter = 1;
  else if (accStr === "##") alter = 2;
  else if (accStr === "b" || accStr === "♭") alter = -1;
  else if (accStr === "bb") alter = -2;

  const rest = trimmed.slice(rootMatch[0].length);

  // Parse quality/kind
  let kind = "major";
  if (/^maj7/.test(rest) || /^Δ7/.test(rest) || /^M7/.test(rest)) kind = "major-seventh";
  else if (/^maj9/.test(rest)) kind = "major-ninth";
  else if (/^maj/.test(rest) || /^Δ/.test(rest) || /^M(?!in)/.test(rest)) kind = "major";
  else if (/^m7b5/.test(rest) || /^ø/.test(rest) || /^min7b5/.test(rest)) kind = "half-diminished";
  else if (/^m7/.test(rest) || /^min7/.test(rest) || /^-7/.test(rest)) kind = "minor-seventh";
  else if (/^m9/.test(rest) || /^min9/.test(rest)) kind = "minor-ninth";
  else if (/^m/.test(rest) || /^min/.test(rest) || /^-/.test(rest)) kind = "minor";
  else if (/^dim7/.test(rest) || /^°7/.test(rest)) kind = "diminished-seventh";
  else if (/^dim/.test(rest) || /^°/.test(rest)) kind = "diminished";
  else if (/^aug/.test(rest) || /^\+/.test(rest)) kind = "augmented";
  else if (/^7#9/.test(rest)) kind = "dominant";
  else if (/^7b9/.test(rest)) kind = "dominant";
  else if (/^7#5/.test(rest)) kind = "augmented-seventh";
  else if (/^7b5/.test(rest)) kind = "dominant";
  else if (/^7sus4/.test(rest)) kind = "suspended-fourth";
  else if (/^7sus/.test(rest)) kind = "suspended-fourth";
  else if (/^7/.test(rest) || /^dom/.test(rest)) kind = "dominant";
  else if (/^9/.test(rest)) kind = "dominant-ninth";
  else if (/^13/.test(rest)) kind = "dominant-13th";
  else if (/^11/.test(rest)) kind = "dominant-11th";
  else if (/^6/.test(rest)) kind = "major-sixth";
  else if (/^sus4/.test(rest) || /^sus$/.test(rest)) kind = "suspended-fourth";
  else if (/^sus2/.test(rest)) kind = "suspended-second";
  else if (/^add9/.test(rest)) kind = "major";
  else if (/^5/.test(rest)) kind = "power";

  // Bass note (slash chord)
  let bass: string | undefined;
  let bassAlter: number | undefined;
  const slashMatch = rest.match(/\/([A-Ga-g])(#{1,2}|b{1,2}|♯|♭)?$/);
  if (slashMatch) {
    bass = slashMatch[1].toUpperCase();
    const bAcc = slashMatch[2] ?? "";
    if (bAcc === "#" || bAcc === "♯") bassAlter = 1;
    else if (bAcc === "b" || bAcc === "♭") bassAlter = -1;
  }

  return { root: rootLetter, alter: alter || undefined, kind, bass, bassAlter, text: trimmed };
}

export function generateChordChartXML(title: string, bars: Bar[]): string {
  if (bars.length === 0) return "";

  const divisions = 2; // 2 divisions per quarter — handles 8th notes

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>${esc(title || "Chord Chart")}</part-name></score-part>
  </part-list>
  <part id="P1">
`;

  let prevTs = "";

  for (let bi = 0; bi < bars.length; bi++) {
    const bar = bars[bi];
    const ts = bar.timeSig && bar.timeSig !== "__custom__" ? bar.timeSig : "4/4";
    const [numStr, denStr] = ts.split("/");
    const num = parseInt(numStr) || 4;
    const den = parseInt(denStr) || 4;

    xml += `    <measure number="${bi + 1}">\n`;

    if (bi === 0) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${divisions}</divisions>\n`;
      xml += `        <time><beats>${num}</beats><beat-type>${den}</beat-type></time>\n`;
      xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
      xml += `      </attributes>\n`;
      prevTs = ts;
    } else if (ts !== prevTs) {
      xml += `      <attributes><time><beats>${num}</beats><beat-type>${den}</beat-type></time></attributes>\n`;
      prevTs = ts;
    }

    // Duration per beat in divisions
    const beatDur = den === 8 ? 1 : 2; // 8th-note beats = 1 division, quarter beats = 2

    for (let beat = 0; beat < bar.beats; beat++) {
      const chordName = (bar.chords[beat] ?? "").trim();
      const parsed = parseChord(chordName);

      // Emit harmony (chord symbol)
      if (parsed) {
        xml += "      <harmony>\n";
        xml += `        <root><root-step>${parsed.root}</root-step>`;
        if (parsed.alter) xml += `<root-alter>${parsed.alter}</root-alter>`;
        xml += "</root>\n";
        xml += `        <kind text="${esc(parsed.text)}">${parsed.kind}</kind>\n`;
        if (parsed.bass) {
          xml += `        <bass><bass-step>${parsed.bass}</bass-step>`;
          if (parsed.bassAlter) xml += `<bass-alter>${parsed.bassAlter}</bass-alter>`;
          xml += "</bass>\n";
        }
        xml += "      </harmony>\n";
      }

      // Rhythm slash note (B4 with slash notehead)
      const noteType = den === 8 ? "eighth" : "quarter";
      xml += "      <note>\n";
      xml += "        <pitch><step>B</step><octave>4</octave></pitch>\n";
      xml += `        <duration>${beatDur}</duration>\n`;
      xml += "        <voice>1</voice>\n";
      xml += `        <type>${noteType}</type>\n`;
      xml += "        <stem>up</stem>\n";
      xml += "        <notehead>slash</notehead>\n";
      xml += "      </note>\n";
    }

    xml += `    </measure>\n`;
  }

  xml += "  </part>\n</score-partwise>";
  return xml;
}
