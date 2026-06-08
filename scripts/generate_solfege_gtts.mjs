// ── Generate solfège syllable mp3s via Google Translate TTS (free, no auth) ──
// Reads public/solfege/manifest.json (solfège → IPA), respells each IPA into a
// spelling Google's English voice pronounces correctly, fetches the mp3, and
// saves it to public/solfege/<name>.mp3.  No AWS / API keys required.
//
//   node scripts/generate_solfege_gtts.mjs            # English (tl=en)
//   TL=en-GB node scripts/generate_solfege_gtts.mjs   # accent variant
//   FORCE=1 node scripts/generate_solfege_gtts.mjs    # re-download existing
//
// Not as phonetically exact as AWS Polly's <phoneme ipa>, but natural-sounding
// and correct for these syllables.  For strict IPA use download_solfege_mp3.mjs.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../public/solfege");
const MANIFEST = join(OUT_DIR, "manifest.json");
const TL = process.env.TL || "en";
const FORCE = !!process.env.FORCE;

const fileFor = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") + ".mp3";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true).catch(() => false);

// IPA → English respelling pieces that Google's en TTS pronounces reliably.
const ONSETS = [["tr", "tr"], ["tw", "tw"], ["θ", "th"], ["s", "s"], ["f", "f"],
                ["k", "k"], ["t", "t"], ["v", "v"], ["h", "h"], ["d", "d"]];
const VOWELS = { "aɪ": "igh", "eɪ": "ay", "a": "ah", "ɒ": "aw", "i": "ee",
                 "u": "oo", "ɛ": "eh", "ɔ": "aw", "ʌ": "uh", "ɪ": "ih" };
const CODAS = { "s": "ss", "l": "l" };

// Parse an IPA syllable → respelling.  onset + vowel + optional coda.
function respell(ipa) {
  let rest = ipa.replace(/\//g, "");
  let onset = "";
  for (const [ipaOn, eng] of ONSETS) {
    if (rest.startsWith(ipaOn)) { onset = eng; rest = rest.slice(ipaOn.length); break; }
  }
  let coda = "";
  const last = rest.slice(-1);
  if (CODAS[last] && rest.length > 1) { coda = CODAS[last]; rest = rest.slice(0, -1); }
  // try 2-char vowel first, then 1-char
  let vowel = VOWELS[rest];
  if (vowel === undefined) {
    // fall back: leave whatever's left (shouldn't happen for our set)
    vowel = rest;
    console.warn(`  (no vowel map for "${rest}" in /${ipa}/)`);
  }
  return onset + vowel + coda;
}

async function fetchTTS(text) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${TL}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error(`tiny (${buf.length} B)`);
  return buf;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const entries = Object.entries(manifest);
  console.log(`${entries.length} syllables · Google TTS · tl=${TL}\n`);

  let ok = 0, skip = 0, fail = 0;
  for (const [solfege, ipa] of entries) {
    const out = join(OUT_DIR, fileFor(solfege));
    if (!FORCE && (await exists(out))) { console.log(`skip  ${solfege}`); skip++; continue; }
    const text = respell(ipa);
    try {
      const buf = await fetchTTS(text);
      await writeFile(out, buf);
      console.log(`ok    ${solfege.padEnd(6)} /${ipa}/ → "${text}" → ${fileFor(solfege)} (${buf.length} B)`);
      ok++;
    } catch (e) {
      console.warn(`FAIL  ${solfege.padEnd(6)} /${ipa}/ → "${text}" — ${e.message}`);
      fail++;
    }
    await sleep(300);
  }
  console.log(`\ndone — ${ok} written, ${skip} skipped, ${fail} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
