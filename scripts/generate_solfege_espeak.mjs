// ── Generate solfège syllable mp3s via espeak-ng (exact IPA phonemes, free) ──
// Reads public/solfege/manifest.json (solfège → IPA), converts each IPA string
// to espeak-ng phoneme input, synthesizes a wav, and transcodes to mp3 with
// ffmpeg.  Pronunciation is exactly the IPA (robotic voice, but correct).
//
//   ESPEAK_NG="C:\\Program Files\\eSpeak NG\\espeak-ng.exe" \
//   node scripts/generate_solfege_espeak.mjs
//
//   ESPEAK_DATA=<dir containing espeak-ng-data>   # optional, if not auto-found
//   FFMPEG=<path to ffmpeg>                        # default: ffmpeg on PATH
//   VOICE=en-us  SPEED=140  FORCE=1                # tweaks
//
// Install espeak-ng from https://github.com/espeak-ng/espeak-ng/releases
// (the espeak-ng.msi), then point ESPEAK_NG at espeak-ng.exe.

import { readFile, mkdir, access, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../public/solfege");
const MANIFEST = join(OUT_DIR, "manifest.json");
const TMP_WAV = join(OUT_DIR, "_tmp.wav");

const ESPEAK = process.env.ESPEAK_NG || "espeak-ng";
const ESPEAK_DATA = process.env.ESPEAK_DATA || "";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const VOICE = process.env.VOICE || "en-us";
const SPEED = process.env.SPEED || "140";
const FORCE = !!process.env.FORCE;

const fileFor = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") + ".mp3";
const exists = (p) => access(p).then(() => true).catch(() => false);

// IPA → espeak-ng phoneme mnemonics (en).  Longest tokens first.
const TOKENS = [
  ["aɪ", "aI"], ["eɪ", "eI"], ["tr", "tr"], ["tw", "tw"],
  ["θ", "T"], ["a", "a"], ["ɒ", "0"], ["i", "i:"], ["u", "u:"],
  ["ɛ", "E"], ["ɔ", "O:"], ["ʌ", "V"], ["ɪ", "I"],
  ["s", "s"], ["f", "f"], ["k", "k"], ["t", "t"], ["v", "v"],
  ["h", "h"], ["d", "d"], ["l", "l"],
];
function ipaToEspeak(ipa) {
  let rest = ipa.replace(/\//g, "");
  let out = "";
  outer: while (rest.length) {
    for (const [ipaTok, esp] of TOKENS) {
      if (rest.startsWith(ipaTok)) { out += esp; rest = rest.slice(ipaTok.length); continue outer; }
    }
    console.warn(`  (unmapped IPA char "${rest[0]}" in /${ipa}/)`);
    rest = rest.slice(1);
  }
  return out;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const entries = Object.entries(manifest);
  console.log(`${entries.length} syllables · espeak-ng (${VOICE}) → ffmpeg\nespeak: ${ESPEAK}\n`);

  let ok = 0, skip = 0, fail = 0;
  for (const [solfege, ipa] of entries) {
    const out = join(OUT_DIR, fileFor(solfege));
    if (!FORCE && (await exists(out))) { console.log(`skip  ${solfege}`); skip++; continue; }
    const phon = ipaToEspeak(ipa);
    try {
      const espeakArgs = [];
      if (ESPEAK_DATA) espeakArgs.push(`--path=${ESPEAK_DATA}`);
      espeakArgs.push("-v", VOICE, "-s", SPEED, "-w", TMP_WAV, `[[${phon}]]`);
      execFileSync(ESPEAK, espeakArgs, { stdio: "pipe" });
      // transcode wav → mp3 (mono, normalized a touch)
      execFileSync(FFMPEG, ["-y", "-i", TMP_WAV, "-ac", "1", "-ar", "22050",
        "-af", "loudnorm=I=-16:TP=-1.5", "-codec:a", "libmp3lame", "-q:a", "5", out], { stdio: "pipe" });
      console.log(`ok    ${solfege.padEnd(6)} /${ipa}/ → [[${phon}]] → ${fileFor(solfege)}`);
      ok++;
    } catch (e) {
      console.warn(`FAIL  ${solfege.padEnd(6)} /${ipa}/ → [[${phon}]] — ${e.message.split("\n")[0]}`);
      fail++;
    }
  }
  await rm(TMP_WAV, { force: true });
  console.log(`\ndone — ${ok} written, ${skip} skipped, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
