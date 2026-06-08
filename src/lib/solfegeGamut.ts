// ── Full-gamut solfège (Tunizo interval-spectrum language) ──────────
// One cell per interval category, with solfège syllable + IPA + cent range.
// Source: user "Full gamut" chart.

import { solfegeName } from "./intervalCodes";

export interface SolfegeCell {
  solfege: string;
  ipa: string;
  lo: number;
  hi: number;
  group: string;   // section header for the palette
}

export const SOLFEGE_GAMUT: SolfegeCell[] = [
  { solfege: "A",     ipa: "a",     lo: 0,    hi: 0,    group: "Unison" },
  { solfege: "O",     ipa: "ɒ",     lo: 0,    hi: 30,   group: "Comma" },
  { solfege: "Ee",    ipa: "i",     lo: 30,   hi: 60,   group: "Diesis" },
  { solfege: "Sais",  ipa: "saɪs",  lo: 60,   hi: 80,   group: "2nd" },
  { solfege: "Sai",   ipa: "saɪ",   lo: 80,   hi: 100,  group: "2nd" },
  { solfege: "Sail",  ipa: "saɪl",  lo: 100,  hi: 125,  group: "2nd" },
  { solfege: "Soos",  ipa: "sus",   lo: 125,  hi: 135,  group: "2nd" },
  { solfege: "Soo",   ipa: "su",    lo: 135,  hi: 160,  group: "2nd" },
  { solfege: "Sool",  ipa: "sul",   lo: 160,  hi: 170,  group: "2nd" },
  { solfege: "Ha",    ipa: "ha",    lo: 160,  hi: 182,  group: "2nd" },
  { solfege: "Says",  ipa: "seɪs",  lo: 180,  hi: 200,  group: "2nd" },
  { solfege: "Say",   ipa: "seɪ",   lo: 200,  hi: 220,  group: "2nd" },
  { solfege: "Sayl",  ipa: "seɪl",  lo: 220,  hi: 240,  group: "2nd" },
  { solfege: "Fe",    ipa: "fɛ",    lo: 240,  hi: 260,  group: "Semifourth" },
  { solfege: "Thais", ipa: "θaɪs",  lo: 260,  hi: 280,  group: "3rd" },
  { solfege: "Thai",  ipa: "θaɪ",   lo: 280,  hi: 300,  group: "3rd" },
  { solfege: "Thail", ipa: "θaɪl",  lo: 300,  hi: 330,  group: "3rd" },
  { solfege: "Thoos", ipa: "θus",   lo: 330,  hi: 342,  group: "3rd" },
  { solfege: "Thoo",  ipa: "θu",    lo: 342,  hi: 360,  group: "3rd" },
  { solfege: "Thool", ipa: "θul",   lo: 360,  hi: 372,  group: "3rd" },
  { solfege: "Thays", ipa: "θeɪs",  lo: 372,  hi: 400,  group: "3rd" },
  { solfege: "Thay",  ipa: "θeɪ",   lo: 400,  hi: 423,  group: "3rd" },
  { solfege: "Thayl", ipa: "θeɪl",  lo: 423,  hi: 440,  group: "3rd" },
  { solfege: "Ke",    ipa: "kɛ",    lo: 440,  hi: 468,  group: "Semisixth" },
  { solfege: "Fos",   ipa: "fɔs",   lo: 468,  hi: 491,  group: "4th" },
  { solfege: "Fo",    ipa: "fɔ",    lo: 491,  hi: 505,  group: "4th" },
  { solfege: "Fol",   ipa: "fɔl",   lo: 505,  hi: 528,  group: "4th" },
  { solfege: "Foo",   ipa: "fu",    lo: 528,  hi: 560,  group: "Superfourth" },
  { solfege: "Trais", ipa: "traɪs", lo: 560,  hi: 577,  group: "Tritone" },
  { solfege: "Trai",  ipa: "traɪ",  lo: 577,  hi: 623,  group: "Tritone" },
  { solfege: "Trail", ipa: "traɪl", lo: 623,  hi: 640,  group: "Tritone" },
  { solfege: "Fu",    ipa: "fʌ",    lo: 640,  hi: 672,  group: "Subfifth" },
  { solfege: "Fis",   ipa: "fɪs",   lo: 672,  hi: 695,  group: "5th" },
  { solfege: "Fi",    ipa: "fɪ",    lo: 695,  hi: 709,  group: "5th" },
  { solfege: "Fil",   ipa: "fɪl",   lo: 709,  hi: 732,  group: "5th" },
  { solfege: "Te",    ipa: "tɛ",    lo: 732,  hi: 760,  group: "Semitenth" },
  { solfege: "Kais",  ipa: "kaɪs",  lo: 760,  hi: 777,  group: "6th" },
  { solfege: "Kai",   ipa: "kaɪ",   lo: 777,  hi: 800,  group: "6th" },
  { solfege: "Kail",  ipa: "kaɪl",  lo: 800,  hi: 828,  group: "6th" },
  { solfege: "Koos",  ipa: "kus",   lo: 828,  hi: 840,  group: "6th" },
  { solfege: "Koo",   ipa: "ku",    lo: 840,  hi: 858,  group: "6th" },
  { solfege: "Kool",  ipa: "kul",   lo: 858,  hi: 870,  group: "6th" },
  { solfege: "Kays",  ipa: "keɪs",  lo: 870,  hi: 900,  group: "6th" },
  { solfege: "Kay",   ipa: "keɪ",   lo: 900,  hi: 920,  group: "6th" },
  { solfege: "Kayl",  ipa: "keɪl",  lo: 920,  hi: 940,  group: "6th" },
  { solfege: "Twe",   ipa: "twɛ",   lo: 940,  hi: 960,  group: "Semitwelfth" },
  { solfege: "Vais",  ipa: "vaɪs",  lo: 960,  hi: 987,  group: "7th" },
  { solfege: "Vai",   ipa: "vaɪ",   lo: 987,  hi: 1000, group: "7th" },
  { solfege: "Vail",  ipa: "vaɪl",  lo: 1000, hi: 1025, group: "7th" },
  { solfege: "Ho",    ipa: "hɒ",    lo: 1018, hi: 1040, group: "7th" },
  { solfege: "Voos",  ipa: "vus",   lo: 1030, hi: 1043, group: "7th" },
  { solfege: "Voo",   ipa: "vu",    lo: 1043, hi: 1065, group: "7th" },
  { solfege: "Vool",  ipa: "vul",   lo: 1065, hi: 1075, group: "7th" },
  { solfege: "Vays",  ipa: "veɪs",  lo: 1075, hi: 1100, group: "7th" },
  { solfege: "Vay",   ipa: "veɪ",   lo: 1100, hi: 1120, group: "7th" },
  { solfege: "Vayl",  ipa: "veɪl",  lo: 1120, hi: 1140, group: "7th" },
  { solfege: "Dee",   ipa: "di",    lo: 1140, hi: 1170, group: "Octave−" },
  { solfege: "Co",    ipa: "kɒ",    lo: 1170, hi: 1200, group: "Octave−" },
  { solfege: "A",     ipa: "a",     lo: 1200, hi: 1200, group: "Octave" },
];

const IPA_BY_SOLFEGE: Record<string, string> = Object.fromEntries(SOLFEGE_GAMUT.map(c => [c.solfege, c.ipa]));

/** Solfège syllable + IPA for a pitch in cents.  Uses the same band logic as
 *  the spectrum codes (so 12-EDO's diatonic notes land on the center syllables
 *  — Say, Thay, Fo, Fi, Kay, Vay). */
export function solfegeFor(cents: number): { solfege: string; ipa: string } {
  const solfege = solfegeName(cents);
  return { solfege, ipa: IPA_BY_SOLFEGE[solfege] ?? solfege };
}

// IPA → audio endpoint.  Only used if you've deployed your own AWS-Polly
// serverless function and set VITE_IPA_ENDPOINT (see server/polly-ipa/).
// Otherwise we use the best available browser voice on the solfège spelling —
// reliable and decent, vs. the flaky/robotic public endpoints.
const IPA_ENDPOINT = import.meta.env.VITE_IPA_ENDPOINT as string | undefined;
let ipaVoice = "Brian";
export function setIpaVoice(v: string) { ipaVoice = v; }

// Pick the best-sounding available browser voice (online/neural/natural English
// voices are far better than the default robotic one).
let cachedVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const vs = window.speechSynthesis.getVoices();
  if (!vs.length) return null;
  const en = vs.filter(v => /^en/i.test(v.lang));
  return en.find(v => /natural|neural/i.test(v.name))
    || en.find(v => /google/i.test(v.name))
    || en.find(v => v.localService === false)
    || en.find(v => /aria|jenny|guy|libby|sonia|ryan|hazel/i.test(v.name))
    || en[0] || vs[0] || null;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  cachedVoice = pickVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => { cachedVoice = pickVoice(); });
}

function speechFallback(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = cachedVoice ?? pickVoice();
  if (v) u.voice = v;
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// Pre-rendered syllable mp3s (e.g. downloaded from ipa-reader.com) live in
// public/solfege/<solfege-lowercased>.mp3.  These are checked FIRST — they're
// exact and need no network/Polly.  See public/solfege/README.md for the list.
const LOCAL_MP3_BASE = (import.meta.env.BASE_URL ?? "/") + "solfege/";
const localMp3Url = (solfege: string) =>
  LOCAL_MP3_BASE + solfege.toLowerCase().replace(/[^a-z0-9]/g, "") + ".mp3";
// remember which syllables actually have a local mp3 so we don't re-probe.
const localMp3Status = new Map<string, boolean>();

function remoteOrSpeech(cell: { solfege: string; ipa: string }): void {
  if (!IPA_ENDPOINT || typeof fetch === "undefined") { speechFallback(cell.solfege); return; }
  fetch(IPA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: cell.ipa, voice: ipaVoice }),
  })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
    .then((b64: unknown) => {
      const data = typeof b64 === "string" ? b64 : "";
      if (!data) return Promise.reject(new Error("no audio"));
      return new Audio("data:audio/mpeg;base64," + data).play();
    })
    .catch(() => speechFallback(cell.solfege));
}

/** Speak a solfège syllable.  Order of preference:
 *  1. a bundled mp3 at public/solfege/<name>.mp3 (exact, offline);
 *  2. your AWS-Polly endpoint (VITE_IPA_ENDPOINT) if set;
 *  3. the browser's speech synth on the solfège spelling. */
export function speakSolfege(cell: { solfege: string; ipa: string }): void {
  if (typeof Audio === "undefined") { remoteOrSpeech(cell); return; }
  if (localMp3Status.get(cell.solfege) === false) { remoteOrSpeech(cell); return; }
  const a = new Audio(localMp3Url(cell.solfege));
  let fellBack = false;
  const fallback = () => { if (!fellBack) { fellBack = true; localMp3Status.set(cell.solfege, false); remoteOrSpeech(cell); } };
  a.addEventListener("error", fallback);
  a.play().then(() => { localMp3Status.set(cell.solfege, true); }).catch(fallback);
}
