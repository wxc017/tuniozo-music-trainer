import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { alphaTab } from "@coderline/alphatab-vite";
import path from "path";

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // alphaTab (Blues tab): wires the audio worklet + web workers so playback
    // actually produces sound.  Asset copying is disabled — we copy alphaTab's
    // font + soundfont ourselves via viteStaticCopy below.
    ...alphaTab({ assetOutputDir: false }),
    // Copy piper-wasm runtime files into the public output so the
    // browser can fetch them at runtime.  Required: the WASM binary,
    // its data file, the loader JS, the worker script, the ONNX
    // runtime files, and the eSpeak voice / language data the
    // phonemizer needs.  Total ~60 MB; the user opted in.
    viteStaticCopy({
      // `stripBase` removes the leading `node_modules/...` portion so
      // files land at the right place under `dest`.  For the deep
      // espeak-ng-data trees we strip exactly 5 segments (the path up
      // to and including the voices/lang directory itself) to keep the
      // inner hierarchy that eSpeak expects (e.g. `voices/!v/Alex`).
      // `dot: true` lets fast-glob match directories like `!v` and any
      // dot-prefixed entries in those data dirs.
      targets: [
        { src: "node_modules/piper-wasm/build/piper_phonemize.{wasm,data,js}", dest: "piper", rename: { stripBase: true } },
        { src: "node_modules/piper-wasm/build/worker/piper_worker.js",         dest: "piper", rename: { stripBase: true } },
        { src: "node_modules/piper-wasm/build/worker/dist/**/*",               dest: "piper/dist", rename: { stripBase: 6 }, globOptions: { dot: true } },
        { src: "node_modules/piper-wasm/espeak-ng/espeak-ng-data/voices/**/*", dest: "piper/espeak-ng-data", rename: { stripBase: 4 }, globOptions: { dot: true } },
        { src: "node_modules/piper-wasm/espeak-ng/espeak-ng-data/lang/**/*",   dest: "piper/espeak-ng-data", rename: { stripBase: 4 }, globOptions: { dot: true } },
        // alphaTab (Blues tab-player): the Bravura music font for notation
        // glyphs + the sonivox soundfont for its built-in MIDI synth.
        { src: "node_modules/@coderline/alphatab/dist/font/*",            dest: "alphatab/font", rename: { stripBase: true } },
        { src: "node_modules/@coderline/alphatab/dist/soundfont/*.sf2",   dest: "alphatab/soundfont", rename: { stripBase: true } },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  optimizeDeps: {
    include: ["pdfjs-dist", "pdfjs-dist/legacy/build/pdf.mjs"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
