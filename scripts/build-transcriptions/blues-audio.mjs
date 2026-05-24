// ── Blues audio: download recordings locally + detect the solo's first note ──
//
// Per direct user direction: download each blues solo's actual recording to a
// local file so the app plays it offline (no YouTube/internet at play time),
// and analyse the audio to find the FIRST NOTE so the seek lands on the real
// spot.  Audio lives in public/blues/audio/<vid>.mp3 and is GITIGNORED — these
// are copyrighted recordings, kept locally for personal/educational use only.
//
// Run after blues.mjs (which resolves each solo's `vid`):
//   node scripts/build-transcriptions/blues-audio.mjs
//
// Needs yt-dlp (pip install yt-dlp) + ffmpeg on PATH (or set YTDLP / FFMPEG).

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLUES_JSON = join(__dirname, "..", "..", "public", "transcriptions", "blues.json");
const AUDIO_DIR = join(__dirname, "..", "..", "public", "blues", "audio");
mkdirSync(AUDIO_DIR, { recursive: true });

const YTDLP = process.env.YTDLP || "C:\\Users\\wilda\\AppData\\Local\\Programs\\Python\\Python315\\Scripts\\yt-dlp.exe";
const FFMPEG = process.env.FFMPEG || "ffmpeg";

/** Seconds of the first note (first sound after any leading silence), or 0. */
function firstNoteOnset(mp3) {
  try {
    const out = execSync(`"${FFMPEG}" -hide_banner -i "${mp3}" -af "silencedetect=noise=-35dB:d=0.2" -f null - 2>&1`, { encoding: "utf8" });
    const m = out.match(/silence_end:\s*([\d.]+)/);
    const t = m ? parseFloat(m[1]) : 0;
    // A real recording has sound within a few seconds; a large "first onset"
    // means a near-silent/wrong file — fall back to the start.
    return t > 15 || !Number.isFinite(t) ? 0 : Math.max(0, Math.round(t * 100) / 100);
  } catch { return 0; }
}

const items = JSON.parse(readFileSync(BLUES_JSON, "utf8"));
let dl = 0, missing = 0;
for (const it of items) {
  if (!it.vid) { missing++; continue; }
  const mp3 = join(AUDIO_DIR, `${it.vid}.mp3`);
  if (!existsSync(mp3) || statSync(mp3).size < 10000) {
    try {
      execFileSync(YTDLP, [
        "-x", "--audio-format", "mp3", "--audio-quality", "5", "--no-playlist",
        "-o", join(AUDIO_DIR, `${it.vid}.%(ext)s`),
        `https://www.youtube.com/watch?v=${it.vid}`,
      ], { stdio: "ignore" });
      dl++;
    } catch { console.log(`  download failed: ${it.artist} - ${it.title}`); continue; }
  }
  if (!existsSync(mp3)) continue;
  it.audio = `audio/${it.vid}.mp3`;
  it.solostart = firstNoteOnset(mp3);
  console.log(`  ${it.artist} - ${it.title} -> ${it.audio} @ ${it.solostart}s`);
}
writeFileSync(BLUES_JSON, JSON.stringify(items, null, 1));
console.log(`Blues audio: ${items.filter(i => i.audio).length}/${items.length} have local audio (${dl} downloaded, ${missing} without a video).`);
