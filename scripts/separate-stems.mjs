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

// Probe whether `cmd` exists on PATH by trying to spawn it.  Node's spawn
// emits an 'error' event with code 'ENOENT' when the binary can't be found;
// any successful spawn (regardless of exit code) means the executable exists.
function hasOnPath(cmd) {
  return new Promise(r => {
    const p = spawn(cmd, ["--version"], { stdio: "ignore" });
    p.on("error", () => r(false));
    p.on("exit", () => r(true));
  });
}

// Ask the `py -<version>` launcher where its audio-separator(.exe) shim is.
// Returns the absolute path, or null if the launcher / install isn't there.
// Looks for the EXACT filename — globbing `audio-separator*` would
// alphabetically match `audio-separator-remote.exe` first because '-' sorts
// before '.' in ASCII, and the -remote helper isn't the splitter CLI.
function findInPyVersion(version) {
  return new Promise(r => {
    const probe = "import sys, os; sc = os.path.join(os.path.dirname(sys.executable), 'Scripts'); [print(p) for p in [os.path.join(sc, 'audio-separator.exe'), os.path.join(sc, 'audio-separator')] if os.path.exists(p)]";
    const p = spawn("py", [`-${version}`, "-c", probe], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", d => { out += d.toString(); });
    p.on("error", () => r(null));
    p.on("exit", code => r(code === 0 && out.trim() ? out.trim().split(/\r?\n/)[0] : null));
  });
}

// Cache the resolved separator path so we don't reprobe on every call.
let _separatorPath = null;
async function resolveSeparator() {
  if (_separatorPath) return _separatorPath;
  // 1. Explicit override.
  if (process.env.AUDIO_SEPARATOR_BIN) {
    _separatorPath = process.env.AUDIO_SEPARATOR_BIN;
    return _separatorPath;
  }
  // 2. Bare `audio-separator` on PATH (Linux / Mac / Windows with Scripts dir
  //    on PATH).  Probed with --version so we don't kick off a real run.
  if (await hasOnPath("audio-separator")) {
    _separatorPath = "audio-separator";
    return _separatorPath;
  }
  // 3. Windows `py` launcher: query each common Python version for its
  //    Scripts/audio-separator(.exe).  Newest first so a user with both
  //    3.13 x64 and 3.12 ARM64 gets the 3.13 install.  (The PYTHON_BIN
  //    env var would let users pin a specific interpreter; we don't try
  //    `python -m audio_separator.utils.cli` because that module has no
  //    `if __name__ == "__main__"` block in audio-separator 0.44+ — it
  //    exits silently with no work done.)
  for (const v of ["3.13", "3.12", "3.11", "3.10"]) {
    const found = await findInPyVersion(v);
    if (found) {
      console.log(`  Found audio-separator under py -${v}: ${found}`);
      _separatorPath = found;
      return _separatorPath;
    }
  }
  throw new Error("audio-separator not found.  Install it: `pip install audio-separator` (or `py -3.13 -m pip install audio-separator` on Windows).  Set AUDIO_SEPARATOR_BIN to override.");
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
  // Resolve the audio-separator binary once per process and reuse the path.
  // Auto-discovery works on Windows with `py` launcher available (finds the
  // x64 Python's Scripts/audio-separator.exe); other platforms expect the
  // command on PATH or AUDIO_SEPARATOR_BIN to be set.
  const separator = await resolveSeparator();
  await run(separator, [abs, "--model_filename", modelFile, "--output_dir", stemsDir, "--output_format", "WAV"]);

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
