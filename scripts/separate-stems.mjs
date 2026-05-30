#!/usr/bin/env node
// ── Stem separation (MDX-Net / Demucs) ────────────────────────────
// Offline helper that shells out to the `audio-separator` Python CLI
// to split a song into 4 stems (vocals, drums, bass, other).  The
// user wired this in for the Transcription player so they can mute /
// solo individual instruments while practising.
//
// Default model is MDX-Net (UVR_MDXNET_Main) which the user
// specifically asked for over plain htdemucs.  Pass `--model demucs`
// to use htdemucs as a fallback.
//
// Prereqs (run once):
//   pip install "audio-separator[gpu]"      # or [cpu] without an NVIDIA GPU
//   # audio-separator brings ONNX runtime + auto-downloads the model
//
// Usage:
//   node scripts/separate-stems.mjs <audio-file> [<audio-file>...]
//   node scripts/separate-stems.mjs --model demucs <audio-file>
//
// Output: writes vocals/drums/bass/other into a sibling folder named
//   <basename>.stems/ next to each input file.  The Transcription
//   player auto-detects this layout when present.

import { spawn } from "node:child_process";
import { mkdir, access, rename } from "node:fs/promises";
import { dirname, join, basename, extname, resolve } from "node:path";

function parseArgs(argv) {
  const args = argv.slice(2);
  let model = "mdx";
  const inputs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model") { model = args[++i]; }
    else inputs.push(args[i]);
  }
  return { model, inputs };
}

// Map our model alias to the audio-separator model filename.  These
// names are what audio-separator downloads from UVR's HF repo.
const MODEL_FILES = {
  mdx:        "UVR-MDX-NET-Inst_HQ_3.onnx",   // high-quality MDX-Net instrumental
  demucs:     "htdemucs_ft.yaml",              // Meta's htdemucs (fine-tuned, 4 stems)
  // Per user direction 2026-05-29: 6-stem split (drums, bass, vocals, other,
  // guitar, piano).  Best on-demand option for transcription practice.
  htdemucs_6s: "htdemucs_6s.yaml",
};

// Stem files audio-separator may produce, by model.  Used to rename the
// suffixed default output to a stable {stem}.wav name the player can find.
const MODEL_STEMS = {
  mdx:         ["Vocals", "Instrumental"],
  demucs:      ["Vocals", "Drums", "Bass", "Other"],
  htdemucs_6s: ["Vocals", "Drums", "Bass", "Other", "Guitar", "Piano"],
};

function run(cmd, args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("error", err => { err.spawnFailed = true; rejectP(err); });
    p.on("exit", code => code === 0 ? resolveP() : rejectP(new Error(`${cmd} exited ${code}`)));
  });
}

// Try a chain of (cmd, prefixArgs) strategies, falling through to the next one
// only when a strategy fails because the executable is MISSING (ENOENT) — a
// non-zero exit code is a real failure that propagates immediately.
async function runFirstWorking(strategies, args) {
  let lastErr;
  for (let i = 0; i < strategies.length; i++) {
    const { cmd, prefix = [], label } = strategies[i];
    const fullArgs = [...prefix, ...args];
    try {
      await run(cmd, fullArgs);
      return;
    } catch (e) {
      lastErr = e;
      const missing = e?.code === "ENOENT" || e?.spawnFailed;
      if (!missing) throw e;                       // real failure → stop
      if (i < strategies.length - 1) {
        console.log(`  (${label || cmd} not found, trying next)`);
      }
    }
  }
  throw new Error(`No working audio-separator install found.  Tried: ${strategies.map(s => s.label || s.cmd).join(", ")}.  Last error: ${lastErr?.message || lastErr}`);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function separateOne(input, model) {
  const abs = resolve(input);
  const dir = dirname(abs);
  const base = basename(abs, extname(abs));
  const stemsDir = join(dir, `${base}.stems`);
  await mkdir(stemsDir, { recursive: true });

  const modelFile = MODEL_FILES[model];
  if (!modelFile) throw new Error(`Unknown --model "${model}".  Use mdx, demucs, or htdemucs_6s.`);

  console.log(`\n── Separating ${base} (${model}) ──`);
  // Build a strategy chain for invoking audio-separator.  Each strategy is
  // tried in turn; the first one whose executable is found wins.  Env-var
  // overrides come first so users with custom installs (e.g. a venv) can
  // pin a specific interpreter.  After those, the bare PATH command, then
  // the Windows `py` launcher targeting Python 3.13 (the user's x64
  // install — the ARM64 one can't build some ML deps from source), then a
  // generic `python -m` fallback for non-Windows / non-py-launcher boxes.
  const baseArgs = [abs, "--model_filename", modelFile, "--output_dir", stemsDir, "--output_format", "WAV"];
  const strategies = [];
  if (process.env.AUDIO_SEPARATOR_BIN) strategies.push({ cmd: process.env.AUDIO_SEPARATOR_BIN, label: "AUDIO_SEPARATOR_BIN" });
  if (process.env.PYTHON_BIN) strategies.push({ cmd: process.env.PYTHON_BIN, prefix: ["-m", "audio_separator.utils.cli"], label: "PYTHON_BIN" });
  strategies.push({ cmd: "audio-separator", label: "audio-separator (PATH)" });
  strategies.push({ cmd: "py", prefix: ["-3.13", "-m", "audio_separator.utils.cli"], label: "py -3.13" });
  strategies.push({ cmd: "python", prefix: ["-m", "audio_separator.utils.cli"], label: "python -m" });
  await runFirstWorking(strategies, baseArgs);

  // audio-separator names outputs with the original filename + suffix.
  // Rename them to the canonical {vocals,drums,bass,other,guitar,piano}.wav
  // so the player can look them up consistently across models.
  const candidates = MODEL_STEMS[model] ?? ["Vocals", "Instrumental", "Drums", "Bass", "Other", "Guitar", "Piano"];
  for (const stem of candidates) {
    const src = join(stemsDir, `${base}_(${stem})_${modelFile.replace(/\.[^.]+$/, "")}.wav`);
    const dst = join(stemsDir, `${stem.toLowerCase()}.wav`);
    if (await exists(src)) await rename(src, dst);
  }
  console.log(`✓ stems written to ${stemsDir}`);
}

// Compute where the stems would land for a given audio file — pure path math,
// no IO.  Used by the Vite middleware to check existing stems before invoking
// the (slow) separation step.
export function stemsDirForFile(input) {
  const abs = resolve(input);
  return join(dirname(abs), `${basename(abs, extname(abs))}.stems`);
}

// The canonical stem filenames the player looks up under stemsDirForFile().
// Mirrors MODEL_STEMS[model] lowercased + .wav, but exposed as a single source
// of truth so the frontend and middleware agree on names.
export const STEM_NAMES_6 = ["vocals", "drums", "bass", "other", "guitar", "piano"];

// Programmatic entry point — used by the Vite dev-server middleware so the
// transcription player can split a track on-click (per user direction
// 2026-05-29: "split it when i click on a file").  Returns the canonical
// stems directory once the split completes successfully.
export async function separateFile(input, model = "htdemucs_6s") {
  await separateOne(input, model);
  return stemsDirForFile(input);
}

async function main() {
  const { model, inputs } = parseArgs(process.argv);
  if (inputs.length === 0) {
    console.error("Usage: node scripts/separate-stems.mjs [--model mdx|demucs] <audio>...");
    process.exit(1);
  }
  for (const f of inputs) {
    try { await separateOne(f, model); }
    catch (err) { console.error(`✗ ${f}: ${err.message}`); }
  }
}

main();
