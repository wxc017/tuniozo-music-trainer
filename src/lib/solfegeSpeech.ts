// ── Solfege TTS — IPA-aware pronunciation via Web Speech API ─────────────
//
// Web Speech API doesn't read IPA characters, so we maintain an explicit
// IPA → English-orthography conversion table for each microtonal syllable
// the user can encounter.  Speaking the orthographic form produces the
// intended IPA pronunciation when the browser uses a standard en-US voice.
//
// For Heathwaite syllables (Do / Re / Mi / Fa / etc.) the existing
// orthographic spelling already matches the intended pronunciation, so
// they pass through unchanged.
//
// Voice selection: prefers the highest-quality en-US voice the browser
// exposes (typically Apple's "Samantha" on macOS / iOS, Microsoft's
// "Aria" on Windows 10+, Google's "US English" on Android / Chrome).
// Falls back to default if no preferred voice is available.

// IPA → orthographic English approximation that reads correctly when
// passed to a generic en-US TTS voice.  Keys are the IPA strings used
// in jiTonalityFamilies.ts / microtonalSolfege.ts; values are spelled
// to match standard English pronunciation rules.
const IPA_TO_ORTHO: Record<string, string> = {
  // Unison / Comma / Octave
  "a":      "ah",
  "ɒ":      "aw",
  "i":      "ee",
  // Small / Middle / Large minor 2nds
  "saɪs":   "sice",
  "saɪ":    "sigh",
  "saɪl":   "syle",
  // Neutral 2nds
  "sus":    "soose",
  "su":     "sue",
  "sul":    "soole",
  // Equable Heptatonic
  "ha":     "hah",
  "hɒ":     "haw",
  // Major 2nds
  "seɪs":   "sayse",
  "seɪ":    "say",
  "seɪl":   "sale",
  // Semifourth
  "fɛ":     "feh",
  // Minor 3rds
  "θaɪs":   "thice",
  "θaɪ":    "thigh",
  "θaɪl":   "thile",
  // Neutral 3rds
  "θus":    "thoose",
  "θu":     "thoo",
  "θul":    "thool",
  // Major 3rds
  "θeɪs":   "thayce",
  "θeɪ":    "thay",
  "θeɪl":   "thayle",
  // Semisixth
  "kɛ":     "keh",
  // Fourths
  "fɔs":    "fawss",
  "fɔ":     "faw",
  "fɔl":    "fawl",
  "fu":     "foo",
  // Tritones
  "traɪs":  "trice",
  "traɪ":   "try",
  "traɪl":  "tryle",
  // Subfifth
  "fʌ":     "fuh",
  // Fifths
  "fɪs":    "fiss",
  "fɪ":     "fih",
  "fɪl":    "fill",
  // Semitenth
  "tɛ":     "teh",
  // Minor 6ths
  "kaɪs":   "kice",
  "kaɪ":    "kye",
  "kaɪl":   "kile",
  // Neutral 6ths
  "kus":    "koose",
  "ku":     "koo",
  "kul":    "kool",
  // Major 6ths
  "keɪs":   "kayce",
  "keɪ":    "kay",
  "keɪl":   "kale",
  // Semitwelfth
  "twɛ":    "tweh",
  // Minor 7ths
  "vaɪs":   "vice",
  "vaɪ":    "vye",
  "vaɪl":   "vile",
  // Neutral 7ths
  "vus":    "voose",
  "vu":     "voo",
  "vul":    "vool",
  // Major 7ths
  "veɪs":   "vayce",
  "veɪ":    "vay",
  "veɪl":   "vale",
  // Octave less diesis / comma
  "di":     "dee",

  // ── Heathwaite solfege ─────────────────────────────────────────────
  // The Heathwaite microtonal solfege uses the classical Do-Re-Mi
  // syllables plus vowel-mirrored extensions (Du, Ru, Mu, Fu …) for
  // microtonal alterations.  Pronunciation follows the standard sung
  // solfege convention: Do is /doʊ/ (English "doh"), NOT /duː/ (the
  // English verb "do").  Each row lists IPA → orthographic spelling
  // that the eSpeak en-US phonemizer pronounces correctly.
  // ───────────────────────────────────────────────────────────────────
  "doʊ":    "doh",       // Do  — root
  "diː":    "dee",       // Di  — raised root  (also covers "di" already above)
  "duː":    "doo",       // Du  — half-raised (31-EDO)
  "reɪ":    "ray",       // Re  — major 2nd
  "riː":    "ree",       // Ri  — augmented 2nd
  "rɑː":    "rah",       // Ra  — minor 2nd
  "ruː":    "roo",       // Ru  — half-raised 2nd (31-EDO)
  "roʊ":    "row",       // Ro  — half-flat 2nd / lowered (31-EDO)
  "raɪ":    "rye",       // Rai — wide 2nd (41-EDO)
  "miː":    "mee",       // Mi  — major 3rd
  "mɛ":     "meh",       // Me  — minor 3rd
  "muː":    "moo",       // Mu  — half-raised 3rd (31-EDO)
  "moʊ":    "mow",       // Mo  — high 3rd (31-EDO)
  "mɑː":    "mah",       // Ma  — diminished 3rd / half-flat
  "maɪ":    "my",        // Mai — wide 3rd (41-EDO)
  "fɑː":    "fah",       // Fa  — perfect 4th
  "fiː":    "fee",       // Fi  — augmented 4th
  "fɛ":     "feh",       // Fe  — diminished 4th
  "fuː":    "foo",       // Fu  — half-raised 4th (31-EDO)
  "faɪ":    "fye",       // Fai — wide 4th (41-EDO)
  "soʊl":   "sole",      // Sol — perfect 5th
  "soʊ":    "soh",       // So  — alternate 5th (31-EDO)
  "siː":    "see",       // Si  — augmented 5th
  "sɛ":     "seh",       // Se  — diminished 5th
  "suː":    "soo",       // Su  — half-raised 5th (31-EDO)
  "saɪ":    "sigh",      // Sai — wide 5th (41-EDO)
  "lɑː":    "lah",       // La  — major 6th
  "liː":    "lee",       // Li  — augmented 6th
  "lɛ":     "leh",       // Le  — minor 6th
  "luː":    "loo",       // Lu  — half-raised 6th (31-EDO)
  "loʊ":    "low",       // Lo  — diminished / half-flat 6th
  "laɪ":    "lye",       // Lai — wide 6th (41-EDO)
  "tiː":    "tee",       // Ti  — major 7th
  "tɛ":     "teh",       // Te  — minor 7th
  "tɑː":    "tah",       // Ta  — diminished 7th / half-flat
  "tuː":    "too",       // Tu  — half-raised 7th (31-EDO)
  "toʊ":    "toe",       // To  — high 7th (31-EDO)
  "taɪ":    "tie",       // Tai — wide 7th (41-EDO)
  "dɑː":    "dah",       // Da  — half-flat octave (31-EDO)
};

/** IPA pronunciation for each Heathwaite solfege syllable.  The display
 *  table in edoData.ts stores just the syllable name (e.g. "Do", "Re",
 *  "Mi"); this map gives the IPA the user actually wants to hear when
 *  they click the syllable.  Without it, piper's eSpeak en-US rules
 *  read "Do" as the verb /duː/ rather than the sung /doʊ/. */
const HEATHWAITE_IPA: Record<string, string> = {
  Do: "doʊ",  Di: "diː",  Du: "duː",
  Re: "reɪ",  Ri: "riː",  Ru: "ruː",  Ra: "rɑː",  Ro: "roʊ",  Rai: "raɪ",
  Mi: "miː",  Me: "mɛ",   Mu: "muː",  Ma: "mɑː",  Mo: "moʊ",  Mai: "maɪ",
  Fa: "fɑː",  Fi: "fiː",  Fe: "fɛ",   Fu: "fuː",  Fai: "faɪ",
  Sol: "soʊl", So: "soʊ", Si: "siː",  Se: "sɛ",   Su: "suː",  Sai: "saɪ",
  La: "lɑː",  Li: "liː",  Le: "lɛ",   Lu: "luː",  Lo: "loʊ",  Lai: "laɪ",
  Ti: "tiː",  Te: "tɛ",   Ta: "tɑː",  Tu: "tuː",  To: "toʊ",  Tai: "taɪ",
  Da: "dɑː",
};

/** Look up the IPA for a Heathwaite syllable, e.g. heathwaiteIpa("Do") →
 *  "doʊ".  Returns null when the syllable isn't in the Heathwaite
 *  table (caller can fall back to plain text). */
export function heathwaiteIpa(syllable: string): string | null {
  return HEATHWAITE_IPA[syllable] ?? null;
}

/** Convert an IPA string to its English-orthography approximation that
 *  the Web Speech API will pronounce correctly.  Returns the IPA
 *  unchanged if no mapping is known. */
export function ipaToEnglishOrtho(ipa: string): string {
  return IPA_TO_ORTHO[ipa] ?? ipa;
}

// ── Voice selection ──────────────────────────────────────────────────────
// Cache the best available en-US voice once the voices list resolves.
// Browser SpeechSynthesis populates voices async, so we listen for
// onvoiceschanged once, then keep the choice for the session.
let cachedVoice: SpeechSynthesisVoice | null = null;
let voicePicked = false;

const PREFERRED_NAMES = [
  // Apple — high quality natural-ish
  "Samantha", "Alex", "Karen",
  // Microsoft Windows 10+ / Edge
  "Aria", "Jenny", "Guy", "Microsoft Aria Online (Natural) - English (United States)",
  // Google Chrome / Android
  "Google US English", "Google UK English Female",
];

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return null;
  // Prefer a name match in priority order.
  for (const name of PREFERRED_NAMES) {
    const v = all.find(voice => voice.name === name || voice.name.includes(name));
    if (v) return v;
  }
  // Fall back: any en-US voice.
  const en = all.find(v => v.lang === "en-US" || v.lang.startsWith("en-US"));
  if (en) return en;
  // Final fall back: any en-* voice.
  const enAny = all.find(v => v.lang.startsWith("en"));
  return enAny ?? all[0] ?? null;
}

function ensureVoiceCached(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (cachedVoice) return cachedVoice;
  cachedVoice = pickBestVoice();
  if (cachedVoice) voicePicked = true;
  // Some browsers populate voices asynchronously; refresh on the
  // next voiceschanged event if we picked nothing now.
  if (!voicePicked && typeof window.speechSynthesis.addEventListener === "function") {
    const onChange = () => {
      cachedVoice = pickBestVoice();
      if (cachedVoice) {
        voicePicked = true;
        window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      }
    };
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
  }
  return cachedVoice;
}

// ── Public speak() ───────────────────────────────────────────────────────

export interface SpeakOptions {
  /** Optional IPA reference — if provided, the text is replaced with the
   *  English-orthography mapping before being passed to the TTS engine. */
  ipa?: string;
  /** Speech rate (default 0.95). */
  rate?: number;
}

/** Speak a syllable through the browser's Web Speech API.  When an IPA
 *  string is supplied and matches a known mapping, the orthographic
 *  form is used so the engine pronounces the IPA sound correctly. */
export function speakSyllable(text: string, options: SpeakOptions = {}): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const speech = options.ipa ? ipaToEnglishOrtho(options.ipa) : text;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(speech);
  utt.rate = options.rate ?? 0.95;
  utt.pitch = 1.0;
  utt.lang = "en-US";
  const v = ensureVoiceCached();
  if (v) utt.voice = v;
  window.speechSynthesis.speak(utt);
}
