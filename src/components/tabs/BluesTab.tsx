// ── Blues tab-player (alphaTab) ─────────────────────────────────────
//
// A multitrack Guitar-Pro / tab player for blues solos.  Unlike the
// Transcriptions tab (VexFlow + smplr, melody-centric), this uses
// alphaTab — which renders standard notation + guitar TAB and plays the
// score through its own MIDI synth INCLUDING string bends, slides,
// vibrato and whammy.  Because a blues Guitar-Pro file keeps the parts on
// separate tracks (bass / rhythm = chords / lead = solo / drums), you can
// solo or mute each part to study the bass, the comping, or the lead in
// isolation — and a reference recording link lets you hear the real
// player's inflections.
//
// Sourcing: drop your own .gp / .gp3-.gp7 files in (e.g. the DadaGP blues
// subset, which is access-gated for research/personal use).  A small
// built-in AlphaTex blues ships so the player works out of the box.

import { useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";

// A tiny 12-bar-style blues in A with three separate tracks (Lead / Chords
// / Bass), authored in AlphaTex so it needs no external file.  The lead has
// a whole-step bend so you can hear that alphaTab's synth plays inflections.
const SAMPLE_BLUES = String.raw`\title "Blues Shuffle in A" \subtitle "alphaTab sample — drop in your own .gp below" \tempo 96
.
\track "Lead"
\instrument 27
\tuning E4 B3 G3 D3 A2 E2
:8 5.4 8.4 5.3 7.3{b (0 4)} 5.3 8.4 5.4 8.4 |
:8 5.4 8.4 5.3 7.3{b (0 4)} :4 5.3 5.4 :8 r r |
\track "Chords"
\instrument 27
\tuning E4 B3 G3 D3 A2 E2
:4 (5.4 5.3 6.2) (5.4 5.3 6.2) (5.4 5.3 6.2) (5.4 5.3 6.2) |
:4 (5.4 5.3 6.2) (5.4 5.3 6.2) (5.4 5.3 6.2) (5.4 5.3 6.2) |
\track "Bass"
\instrument 33
\clef F4
\tuning G2 D2 A1 E1
:8 5.3 5.3 7.3 7.3 9.3 9.3 7.3 7.3 |
:8 5.3 5.3 7.3 7.3 9.3 9.3 7.3 7.3 |`;

interface TrackInfo { index: number; name: string; }

export default function BluesTab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [soloed, setSoloed] = useState<Set<number>>(new Set());
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Loading player…");
  const [title, setTitle] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const base = import.meta.env.BASE_URL ?? "/";

    const api = new alphaTab.AlphaTabApi(host, {
      core: {
        // Run on the UI thread — avoids needing a separately-hosted worker
        // script (the audio worklet is created in-process by alphaTab).
        useWorkers: false,
        engine: "svg",
        fontDirectory: `${base}alphatab/font/`,
      },
      player: {
        enablePlayer: true,
        enableCursor: true,
        soundFont: `${base}alphatab/soundfont/sonivox.sf2`,
        scrollMode: alphaTab.ScrollMode.Off,
      },
      display: { scale: 0.9 },
    });
    apiRef.current = api;

    api.scoreLoaded.on(score => {
      setTitle(score.title || "");
      setTracks(score.tracks.map(t => ({ index: t.index, name: t.name || `Track ${t.index + 1}` })));
      setSoloed(new Set());
      setMuted(new Set());
    });
    api.renderFinished.on(() => setStatus(""));
    api.playerReady.on(() => setStatus(""));
    api.playerStateChanged.on(e => setPlaying(e.state === alphaTab.synth.PlayerState.Playing));
    api.error.on(() => setStatus("alphaTab error — see console."));

    api.tex(SAMPLE_BLUES);

    return () => { try { api.destroy(); } catch { /* */ } apiRef.current = null; };
  }, []);

  const trackOf = (i: number) => apiRef.current?.score?.tracks[i];

  const toggleSolo = (i: number) => {
    const api = apiRef.current; const t = trackOf(i); if (!api || !t) return;
    const next = new Set(soloed);
    next.has(i) ? next.delete(i) : next.add(i);
    setSoloed(next);
    api.changeTrackSolo([t], next.has(i));
  };
  const toggleMute = (i: number) => {
    const api = apiRef.current; const t = trackOf(i); if (!api || !t) return;
    const next = new Set(muted);
    next.has(i) ? next.delete(i) : next.add(i);
    setMuted(next);
    api.changeTrackMute([t], next.has(i));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !apiRef.current) return;
    setStatus(`Loading ${file.name}…`);
    try {
      const buf = await file.arrayBuffer();
      const ok = apiRef.current.load(new Uint8Array(buf));
      if (!ok) setStatus(`Could not read ${file.name} (not a valid Guitar Pro file?).`);
    } catch { setStatus(`Failed to load ${file.name}.`); }
  };

  return (
    <div className="flex flex-col gap-3 text-neutral-100">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => apiRef.current?.playPause()}
          className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => apiRef.current?.stop()}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
        >
          Stop
        </button>
        <label className="ml-2 cursor-pointer rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
          Load .gp file…
          <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.musicxml,.xml" onChange={onFile} className="hidden" />
        </label>
        {title && <span className="text-sm text-neutral-400">{title}</span>}
        {status && <span className="text-xs text-amber-400">{status}</span>}
      </div>

      {/* Per-track Solo / Mute — isolate the bass, the chords, or the lead. */}
      {tracks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tracks.map(t => (
            <div key={t.index} className="flex items-center gap-1 rounded bg-neutral-800/60 px-2 py-1 text-sm">
              <span className="mr-1 max-w-[10rem] truncate">{t.name}</span>
              <button
                onClick={() => toggleSolo(t.index)}
                className={`rounded px-2 py-0.5 text-xs font-semibold ${soloed.has(t.index) ? "bg-amber-500 text-black" : "bg-neutral-700 hover:bg-neutral-600"}`}
              >S</button>
              <button
                onClick={() => toggleMute(t.index)}
                className={`rounded px-2 py-0.5 text-xs font-semibold ${muted.has(t.index) ? "bg-rose-600" : "bg-neutral-700 hover:bg-neutral-600"}`}
              >M</button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Tip: solo (S) the Lead to study the solo, the Bass to lock in the groove, or the Chords for the comp.
        Bends, slides and vibrato play back through alphaTab's synth. Drop in your own Guitar Pro files
        (e.g. the DadaGP blues subset — research/personal use) to load real transcriptions.
      </p>

      {/* alphaTab renders notation + tab into this host element. */}
      <div ref={hostRef} className="overflow-auto rounded bg-white p-2" />
    </div>
  );
}
