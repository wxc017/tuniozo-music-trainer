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
};

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
