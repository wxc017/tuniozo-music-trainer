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
// Corpus: public/blues/ (curated canonical solos from the great blues
// guitarists — BB/Albert/Freddie King, SRV, Buddy Guy, … — built by
// scripts/build-transcriptions/blues.mjs from the Internet Archive Guitar
// Pro collection; fan transcriptions, personal/educational use only).  The
// "Load .gp file" button also opens any local Guitar Pro file.

import { useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";

const BASE = import.meta.env.BASE_URL ?? "/";

interface BluesTune { file: string; title: string; artist: string; youtube: string; }
interface TrackInfo { index: number; name: string; }

export default function BluesTab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const [tunes, setTunes] = useState<BluesTune[]>([]);
  const [current, setCurrent] = useState<BluesTune | null>(null);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [soloed, setSoloed] = useState<Set<number>>(new Set());
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("Loading player…");
  const [title, setTitle] = useState("");

  // ── Create the alphaTab API once ──────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const api = new alphaTab.AlphaTabApi(host, {
      core: { engine: "svg", fontDirectory: `${BASE}alphatab/font/` },
      player: {
        enablePlayer: true,
        enableCursor: true,
        soundFont: `${BASE}alphatab/soundfont/sonivox.sf2`,
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

    return () => { try { api.destroy(); } catch { /* */ } apiRef.current = null; };
  }, []);

  // ── Load the curated corpus index ─────────────────────────────────
  useEffect(() => {
    fetch(`${BASE}blues/index.json`)
      .then(r => r.ok ? r.json() : [])
      .then((list: BluesTune[]) => { setTunes(list); if (list.length && !current) loadTune(list[0]); })
      .catch(() => { /* corpus not built — the Load .gp button still works */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTune = async (t: BluesTune) => {
    if (!apiRef.current) return;
    setCurrent(t); setStatus(`Loading ${t.title}…`);
    try {
      const res = await fetch(`${BASE}blues/${t.file}`);
      const buf = await res.arrayBuffer();
      if (!apiRef.current.load(new Uint8Array(buf))) setStatus(`Could not read ${t.title}.`);
    } catch { setStatus(`Failed to load ${t.title}.`); }
  };

  const trackOf = (i: number) => apiRef.current?.score?.tracks[i];
  const toggleSolo = (i: number) => {
    const api = apiRef.current; const t = trackOf(i); if (!api || !t) return;
    const next = new Set(soloed); next.has(i) ? next.delete(i) : next.add(i);
    setSoloed(next); api.changeTrackSolo([t], next.has(i));
  };
  const toggleMute = (i: number) => {
    const api = apiRef.current; const t = trackOf(i); if (!api || !t) return;
    const next = new Set(muted); next.has(i) ? next.delete(i) : next.add(i);
    setMuted(next); api.changeTrackMute([t], next.has(i));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !apiRef.current) return;
    setCurrent(null); setStatus(`Loading ${file.name}…`);
    try {
      const ok = apiRef.current.load(new Uint8Array(await file.arrayBuffer()));
      if (!ok) setStatus(`Could not read ${file.name} (not a valid Guitar Pro file?).`);
    } catch { setStatus(`Failed to load ${file.name}.`); }
  };

  // Group tunes by artist for the picker.
  const byArtist = tunes.reduce<Record<string, BluesTune[]>>((acc, t) => {
    (acc[t.artist] ??= []).push(t); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-3 text-neutral-100">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => apiRef.current?.playPause()} className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium hover:bg-emerald-500">
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => apiRef.current?.stop()} className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600">Stop</button>
        <label className="ml-2 cursor-pointer rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700">
          Load .gp file…
          <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gtp,.musicxml,.xml" onChange={onFile} className="hidden" />
        </label>
        {current?.youtube && (
          <a href={current.youtube} target="_blank" rel="noreferrer" className="rounded bg-red-700/80 px-3 py-1.5 text-sm hover:bg-red-600">▶ Reference recording</a>
        )}
        {status && <span className="text-xs text-amber-400">{status}</span>}
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Tune picker, grouped by artist. */}
        <div className="max-h-64 w-56 shrink-0 overflow-auto rounded bg-neutral-900/60 p-2 text-sm">
          {tunes.length === 0 && <div className="text-xs text-neutral-500">No corpus found. Use “Load .gp file”, or run scripts/build-transcriptions/blues.mjs.</div>}
          {Object.entries(byArtist).map(([artist, list]) => (
            <div key={artist} className="mb-2">
              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-amber-400/80">{artist}</div>
              {list.map(t => (
                <button
                  key={t.file}
                  onClick={() => loadTune(t)}
                  className={`block w-full truncate rounded px-2 py-0.5 text-left ${current?.file === t.file ? "bg-emerald-700/60" : "hover:bg-neutral-800"}`}
                >{t.title}</button>
              ))}
            </div>
          ))}
        </div>

        {/* Notation + tab + transport for the loaded tune. */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {title && <span className="text-sm font-medium">{title}</span>}
            {tracks.map(t => (
              <div key={t.index} className="flex items-center gap-1 rounded bg-neutral-800/60 px-2 py-0.5 text-xs">
                <span className="mr-1 max-w-[8rem] truncate">{t.name}</span>
                <button onClick={() => toggleSolo(t.index)} className={`rounded px-1.5 py-0.5 font-semibold ${soloed.has(t.index) ? "bg-amber-500 text-black" : "bg-neutral-700 hover:bg-neutral-600"}`}>S</button>
                <button onClick={() => toggleMute(t.index)} className={`rounded px-1.5 py-0.5 font-semibold ${muted.has(t.index) ? "bg-rose-600" : "bg-neutral-700 hover:bg-neutral-600"}`}>M</button>
              </div>
            ))}
          </div>
          <p className="mb-2 text-xs text-neutral-500">
            Solo (S) the lead to study the solo, the bass to lock the groove, or the rhythm for the comp.
            Bends/slides/vibrato play through alphaTab's synth.
          </p>
          <div ref={hostRef} className="overflow-auto rounded bg-white p-2" />
        </div>
      </div>
    </div>
  );
}
