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
  mdx:    "UVR-MDX-NET-Inst_HQ_3.onnx",   // high-quality MDX-Net instrumental
  demucs: "htdemucs_ft.yaml",              // Meta's htdemucs (fine-tuned)
};

function run(cmd, args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("error", rejectP);
    p.on("exit", code => code === 0 ? resolveP() : rejectP(new Error(`${cmd} exited ${code}`)));
  });
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
  if (!modelFile) throw new Error(`Unknown --model "${model}".  Use mdx or demucs.`);

  console.log(`\n── Separating ${base} (${model}) ──`);
  await run("audio-separator", [
    abs,
    "--model_filename", modelFile,
    "--output_dir", stemsDir,
    "--output_format", "WAV",
  ]);

  // audio-separator names outputs with the original filename + suffix.
  // Rename them to the canonical {vocals,drums,bass,other}.wav so the
  // player can look them up consistently.
  const candidates = ["Vocals", "Instrumental", "Drums", "Bass", "Other"];
  for (const stem of candidates) {
    const src = join(stemsDir, `${base}_(${stem})_${modelFile.replace(/\.[^.]+$/, "")}.wav`);
    const dst = join(stemsDir, `${stem.toLowerCase()}.wav`);
    if (await exists(src)) await rename(src, dst);
  }
  console.log(`✓ stems written to ${stemsDir}`);
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
