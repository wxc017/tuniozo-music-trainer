import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";
import fs from "node:fs";

const rawPort = process.env.PORT || "3000";
const port = Number(rawPort);

// ── Demucs stem-separation middleware ────────────────────────────────
//
// Exposes two endpoints used by the Transcriptions player to split a track
// into 6 stems (drums/bass/vocals/guitar/piano/other) on demand, per user
// direction 2026-05-29: "split it when i click on a file, its okay if I have
// to wait for it to split when i click on a song".
//
//   GET  /api/stems-check?audio=<rel-path-under-public>
//        → { ok: true, exists: bool, stems: string[], dir: string }
//
//   POST /api/split  body: { audio: <rel-path-under-public>, model?: string }
//        → spawns `node scripts/separate-stems.mjs --model <model> <abs>`,
//          waits for completion, returns { ok: true, dir, stems }
//
// Audio path must resolve inside the public/ tree (no traversal).  Stems
// land at `<file>.stems/{vocals,drums,bass,other,guitar,piano}.wav` next to
// the input — the same convention separate-stems.mjs uses on the CLI.
function demucsPlugin(): Plugin {
  const PUBLIC_DIR = path.resolve(import.meta.dirname, "public");
  const STEM_NAMES_6 = ["vocals", "drums", "bass", "other", "guitar", "piano"];
  const resolveAudio = (rel: string): string | null => {
    if (!rel || typeof rel !== "string") return null;
    const abs = path.resolve(PUBLIC_DIR, decodeURIComponent(rel));
    // Block traversal outside public/.
    const norm = abs.replace(/\\/g, "/");
    const pub = PUBLIC_DIR.replace(/\\/g, "/");
    if (!norm.startsWith(pub + "/") && norm !== pub) return null;
    return abs;
  };
  const stemsDirFor = (abs: string) => {
    const ext = path.extname(abs);
    return path.join(path.dirname(abs), `${path.basename(abs, ext)}.stems`);
  };
  const listExistingStems = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    return STEM_NAMES_6.filter(n => fs.existsSync(path.join(dir, `${n}.wav`)));
  };

  return {
    name: "demucs-split",
    configureServer(server) {
      server.middlewares.use("/api/stems-check", (req, res, next) => {
        if (req.method !== "GET") return next();
        const url = new URL(req.url ?? "", `http://${req.headers.host || "localhost"}`);
        const rel = url.searchParams.get("audio") || "";
        const abs = resolveAudio(rel);
        if (!abs) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: "bad audio path" })); return; }
        const dir = stemsDirFor(abs);
        const stems = listExistingStems(dir);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, exists: stems.length > 0, stems, dir: path.relative(PUBLIC_DIR, dir).replace(/\\/g, "/") }));
      });

      // Open an NDJSON streaming response: sets headers, flushes, returns a
      // `send(obj)` writer.  Each line of the response body is one JSON event:
      //   { "line": "..." }         — splitter stdout line (progress)
      //   { "line": "...", "err": true }  — splitter stderr line
      //   { "done": true, "ok": bool, "stems": [...], "error"?: "..." }
      // The split itself takes minutes; without streaming the user would sit on
      // a static "Splitting..." spinner the whole time.
      function openNdjsonStream(res: import("node:http").ServerResponse) {
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        return (obj: Record<string, unknown>) => { res.write(JSON.stringify(obj) + "\n"); };
      }

      // Run the splitter on an absolute file path, streaming progress via
      // `send` and ending `res` when finished.  Shared between /api/split
      // (corpus tracks) and /api/split-upload (dropped / folder-handle
      // tracks the user just streamed up).
      async function streamSplit(
        abs: string,
        model: string,
        force: boolean,
        send: (obj: Record<string, unknown>) => void,
        res: import("node:http").ServerResponse,
      ): Promise<void> {
        const dir = stemsDirFor(abs);
        // Force re-split wipes the existing .stems dir before running so
        // audio-separator doesn't see stale outputs and skip work.
        if (force && fs.existsSync(dir)) {
          send({ line: `Force re-split: removing existing stems at ${path.relative(PUBLIC_DIR, dir).replace(/\\/g, "/")}` });
          try { fs.rmSync(dir, { recursive: true, force: true }); }
          catch (e) {
            send({ done: true, ok: false, error: `couldn't remove old stems: ${(e as Error).message}` });
            res.end();
            return;
          }
        }
        const have = listExistingStems(dir);
        const need = (model === "htdemucs_6s" || model === "ensemble_6s") ? 6 : (model === "demucs" || model === "demucs_ft") ? 4 : 2;
        if (!force && have.length >= need) {
          send({ line: `Cached: ${have.length} stems already at ${path.relative(PUBLIC_DIR, dir).replace(/\\/g, "/")}` });
          send({ done: true, ok: true, cached: true, dir: path.relative(PUBLIC_DIR, dir).replace(/\\/g, "/"), stems: have });
          res.end();
          return;
        }
        const { spawn } = await import("node:child_process");
        const scriptPath = path.join(import.meta.dirname, "scripts", "separate-stems.mjs");
        send({ line: `Spawning audio-separator (${model}) on ${path.basename(abs)}…` });
        const proc = spawn(process.execPath, [scriptPath, "--model", model, abs], { stdio: ["ignore", "pipe", "pipe"] });
        // tqdm progress bars overwrite a single line via bare \r (no newline),
        // so we split on \r OR \n — each tqdm tick becomes its own NDJSON event
        // and the user sees download/finalize % climb in real time.
        const splitAndSend = (data: Buffer, err: boolean) => {
          for (const line of data.toString().split(/[\r\n]/)) {
            const t = line.trim();
            if (t) send(err ? { line: t, err: true } : { line: t });
          }
        };
        proc.stdout.on("data", d => splitAndSend(d, false));
        proc.stderr.on("data", d => splitAndSend(d, true));
        proc.on("error", err => {
          send({ done: true, ok: false, error: `spawn failed: ${err.message}` });
          res.end();
        });
        proc.on("exit", code => {
          if (code === 0) {
            const stems = listExistingStems(dir);
            send({ done: true, ok: true, dir: path.relative(PUBLIC_DIR, dir).replace(/\\/g, "/"), stems });
          } else {
            send({ done: true, ok: false, error: `separate-stems exit ${code}` });
          }
          res.end();
        });
      }

      server.middlewares.use("/api/split", async (req, res, next) => {
        if (req.method !== "POST") return next();
        let body = "";
        for await (const chunk of req) body += chunk;
        let parsed: { audio?: string; model?: string; force?: boolean };
        try { parsed = JSON.parse(body || "{}"); } catch { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: "bad json" })); return; }
        const abs = resolveAudio(parsed.audio || "");
        if (!abs || !fs.existsSync(abs)) { res.statusCode = 404; res.end(JSON.stringify({ ok: false, error: "audio not found" })); return; }
        const model = parsed.model || "demucs";
        const force = !!parsed.force;
        const send = openNdjsonStream(res);
        await streamSplit(abs, model, force, send, res);
      });

      // /api/split-upload — for tracks the browser holds as blob: URLs (dropped
      // files, folder picker entries).  The browser can't expose the disk path,
      // so we receive the raw bytes here, persist them under public/uploads/,
      // then run the same splitter pipeline.  Per user direction 2026-05-30:
      // "all these files should be local" — the user dragged it in and expects
      // the splitter to work on it just like a corpus track.
      //
      // Query params carry metadata so we don't need a multipart parser:
      //   name   — original filename (sanitized server-side for the path)
      //   model  — splitter model id (default htdemucs_6s)
      //   force  — "true" to wipe + re-split
      //
      // The file's bytes are the entire request body.
      server.middlewares.use("/api/split-upload", async (req, res, next) => {
        if (req.method !== "POST") return next();
        const reqUrl = new URL(req.url ?? "", `http://${req.headers.host || "localhost"}`);
        const rawName = reqUrl.searchParams.get("name") || "upload.mp3";
        const model = reqUrl.searchParams.get("model") || "demucs";
        const force = reqUrl.searchParams.get("force") === "true";
        // Restrict the filename to safe characters + length so it can't escape
        // the uploads dir or land at a path that breaks the splitter CLI.
        const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 200) || "upload.mp3";
        const uploadsDir = path.join(PUBLIC_DIR, "uploads");
        fs.mkdirSync(uploadsDir, { recursive: true });
        const dest = path.join(uploadsDir, safeName);
        // Open the response stream BEFORE the upload so the client can see
        // the upload + split progress as a single flow.
        const send = openNdjsonStream(res);
        send({ line: `Uploading ${safeName}…` });
        try {
          await new Promise<void>((resolveP, rejectP) => {
            const out = fs.createWriteStream(dest);
            req.on("error", rejectP);
            out.on("error", rejectP);
            out.on("finish", () => resolveP());
            req.pipe(out);
          });
        } catch (e) {
          send({ done: true, ok: false, error: `upload failed: ${(e as Error).message}` });
          res.end();
          return;
        }
        const stats = fs.statSync(dest);
        send({ line: `Saved ${stats.size.toLocaleString()} bytes to public/uploads/${safeName}` });
        await streamSplit(dest, model, force, send, res);
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    demucsPlugin(),
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
    // Pin the origin. Without strictPort, a busy port makes Vite silently
    // fall back to 3001/3002/… — a different origin — which orphans the
    // Local Folder Sync handle in IndexedDB (per-origin), dropping the user
    // from "Reconnect folder" back to "Connect a folder". Fail loudly
    // instead so the folder stays remembered across sessions.
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
