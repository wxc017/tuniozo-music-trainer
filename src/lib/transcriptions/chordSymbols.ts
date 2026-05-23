// ── Chord-symbol parser ─────────────────────────────────────────────
//
// Turns a human chord symbol ("Cmaj7", "G7", "F#m7b5", "Bb13#11",
// "Dm7/G", "Asus4") into a pitch-class root + semitone intervals from
// that root.  Used by the ETL to precompute TxChord.{rootPc,intervals}
// and by the seed data; the browser can also call it directly if a
// corpus ships raw symbols.
//
// Scope: standard jazz/pop lead-sheet notation in 12-EDO.  Best-effort:
// an unrecognized tail degrades to the detected base triad rather than
// throwing, so a stray symbol never kills playback.

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse a leading note name + accidentals → [pc, charsConsumed]. */
function parseRoot(s: string): [number, number] | null {
  const m = /^([A-Ga-g])([#b♯♭]*)/.exec(s);
  if (!m) return null;
  let pc = NOTE_PC[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === "#" || ch === "♯") pc += 1;
    else if (ch === "b" || ch === "♭") pc -= 1;
  }
  return [((pc % 12) + 12) % 12, m[0].length];
}

type BaseQuality = "maj" | "min" | "dim" | "aug" | "sus2" | "sus4";

const BASE_TRIAD: Record<BaseQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

export interface ParsedChord {
  rootPc: number;
  /** Semitone offsets from root, ascending, root (0) first. */
  intervals: number[];
  bassPc?: number;
  /** Normalized quality label for display fallbacks. */
  quality: string;
}

export function parseChordSymbol(raw: string): ParsedChord | null {
  if (!raw) return null;
  let s = raw.trim()
    .replace(/[Δ∆]/g, "maj7")   // Δ / Δ7 → major seventh
    .replace(/[øØ]/g, "m7b5")    // half-diminished
    .replace(/[°ο]/g, "dim")     // diminished
    .replace(/−/g, "-");         // unicode minus → hyphen (minor)

  // Slash bass: split on the last "/" whose tail begins with a note name.
  let bassPc: number | undefined;
  const slash = s.lastIndexOf("/");
  if (slash >= 0) {
    const bass = parseRoot(s.slice(slash + 1));
    if (bass) { bassPc = bass[0]; s = s.slice(0, slash); }
  }

  const root = parseRoot(s);
  if (!root) return null;
  const [rootPc, ri] = root;
  let body = s.slice(ri);

  // ── Pull out add<N> tokens first so their degree isn't mistaken for
  //    a stacked extension (e.g. "add9" must NOT imply a b7). ─────────
  const adds: { deg: number; accent: number }[] = [];
  body = body.replace(/add([b#♭♯])?(\d+)/g, (_, acc: string, deg: string) => {
    adds.push({ deg: Number(deg), accent: acc === "b" || acc === "♭" ? -1 : acc === "#" || acc === "♯" ? 1 : 0 });
    return "";
  });

  // ── Suspension can appear anywhere (e.g. "7sus4"); it replaces the
  //    third.  Capture and strip it before quality detection. ─────────
  let sus: 2 | 4 | null = null;
  if (/sus2/.test(body)) { sus = 2; body = body.replace(/sus2/g, ""); }
  else if (/sus4?/.test(body)) { sus = 4; body = body.replace(/sus4?/g, ""); }

  // ── Base triad quality (consume the matched token) ────────────────
  let base: BaseQuality = "maj";
  // "+" only means augmented when it is the quality marker, not "add".
  if (/^\+/.test(body)) { base = "aug"; body = body.replace(/^\+/, ""); }
  else if (/^(dim)/.test(body)) { base = "dim"; body = body.replace(/^dim/, ""); }
  else if (/^aug/.test(body)) { base = "aug"; body = body.replace(/^aug/, ""); }
  else if (/^(maj|Maj|M)(?=7|9|11|13|6|$)/.test(body)) { base = "maj"; body = body.replace(/^(maj|Maj|M)/, "majMARK"); }
  else if (/^(min|m|-)/.test(body)) { base = "min"; body = body.replace(/^(min|m|-)/, ""); }

  if (sus) base = sus === 2 ? "sus2" : "sus4";

  const ivs = new Set<number>(BASE_TRIAD[base]);

  // Major-seventh marker survives as the "majMARK" token we injected,
  // OR appears as an explicit "maj7"/"M7" later in the body.
  const isMajSeventh = /majMARK|maj7|M7/.test(body) || /maj7|M7/.test(s.slice(ri));
  body = body.replace(/majMARK/g, "");

  // Highest stated extension degree (13>11>9>7>6). Accidentals on a
  // degree (b9,#11,…) are handled separately below and must not be read
  // as the plain degree, hence the negative-lookbehind-ish guards.
  const ext =
    /(?<![b#♭♯])13/.test(body) ? 13 :
    /(?<![b#♭♯])11/.test(body) ? 11 :
    /(?<![b#♭♯])9/.test(body)  ? 9  :
    /(?<![b#♭♯])7/.test(body)  ? 7  :
    /(?<![b#♭♯])6/.test(body)  ? 6  : 0;

  // Seventh: maj7 explicit → 11; dim with a 7 → bb7 (9); else dominant b7 (10).
  if (ext >= 7) {
    if (isMajSeventh) ivs.add(11);
    else if (base === "dim") ivs.add(9);
    else ivs.add(10);
  }
  if (ext === 6) ivs.add(9);                 // 6 / m6 add the major sixth
  if (ext >= 9) ivs.add(14);
  if (ext >= 11) ivs.add(17);
  if (ext >= 13) ivs.add(21);

  // ── Alterations ───────────────────────────────────────────────────
  if (/[b♭]5/.test(body)) { ivs.delete(7); ivs.add(6); }
  if (/[#♯]5/.test(body)) { ivs.delete(7); ivs.add(8); }
  if (/[b♭]9/.test(body)) ivs.add(13);
  if (/[#♯]9/.test(body)) ivs.add(15);
  if (/[#♯]11/.test(body)) ivs.add(18);
  if (/[b♭]13/.test(body)) ivs.add(20);

  // ── add<N> (collected earlier) ────────────────────────────────────
  const ADD_MAP: Record<number, number> = { 2: 2, 4: 5, 6: 9, 9: 14, 11: 17, 13: 21 };
  for (const a of adds) {
    if (ADD_MAP[a.deg] != null) ivs.add(ADD_MAP[a.deg] + a.accent);
  }

  return {
    rootPc,
    intervals: Array.from(ivs).sort((a, b) => a - b),
    bassPc,
    quality: base,
  };
}

const PC_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Spell a pitch class as a note name, sharp- or flat-preferring. */
export function spellPc(pc: number, preferFlat = false): string {
  const i = ((pc % 12) + 12) % 12;
  return (preferFlat ? PC_FLAT : PC_SHARP)[i];
}
