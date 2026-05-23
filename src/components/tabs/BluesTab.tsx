// ── Blues tab (essential bluesmen — notation + the real recording) ──
//
// Per the chosen direction: study essential blues solos by SEEING the
// transcription (alphaTab renders notation + guitar TAB) and HEARING the
// ACTUAL recording (embedded YouTube where we have a video id, else a link) —
// MIDI can't reproduce blues phrasing, so there is no synth playback here.
//
// Corpus: public/blues/ (curated by scripts/build-transcriptions/blues.mjs;
// fan transcriptions of copyrighted songs, personal/educational use only).

import { useEffect, useRef, useState } from "react";
import * as alphaTab from "@coderline/alphatab";

const BASE = import.meta.env.BASE_URL ?? "/";

interface BluesTune { file: string; title: string; artist: string; youtube: string; vid?: string; }

export default function BluesTab() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const [tunes, setTunes] = useState<BluesTune[]>([]);
  const [current, setCurrent] = useState<BluesTune | null>(null);
  const [status, setStatus] = useState("Loading…");

  // alphaTab: notation + tab only (no player — we listen to the real recording).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const api = new alphaTab.AlphaTabApi(host, {
      core: { engine: "svg", fontDirectory: `${BASE}alphatab/font/` },
      player: { enablePlayer: false },
      display: { scale: 0.9 },
    });
    apiRef.current = api;
    api.renderFinished.on(() => setStatus(""));
    api.error.on(() => setStatus("alphaTab error — see console."));
    return () => { try { api.destroy(); } catch { /* */ } apiRef.current = null; };
  }, []);

  useEffect(() => {
    fetch(`${BASE}blues/index.json`)
      .then(r => r.ok ? r.json() : [])
      .then((list: BluesTune[]) => { setTunes(list); if (list.length) loadTune(list[0]); })
      .catch(() => setStatus("No corpus found. Run scripts/build-transcriptions/blues.mjs."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTune = async (t: BluesTune) => {
    if (!apiRef.current) return;
    setCurrent(t); setStatus(`Loading ${t.title}…`);
    try {
      const buf = await (await fetch(`${BASE}blues/${t.file}`)).arrayBuffer();
      if (!apiRef.current.load(new Uint8Array(buf))) setStatus(`Could not read ${t.title}.`);
    } catch { setStatus(`Failed to load ${t.title}.`); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !apiRef.current) return;
    setCurrent(null); setStatus(`Loading ${file.name}…`);
    try { apiRef.current.load(new Uint8Array(await file.arrayBuffer())); }
    catch { setStatus(`Failed to load ${file.name}.`); }
  };

  const byArtist = tunes.reduce<Record<string, BluesTune[]>>((acc, t) => {
    (acc[t.artist] ??= []).push(t); return acc;
  }, {});

  return (
    <div className="flex flex-col gap-3 text-neutral-100">
      <p className="text-xs text-neutral-500">
        Essential blues solos: see the transcription, hear the <em>real</em> recording (MIDI can't capture the phrasing).
        Pick a tune; the actual record plays below.
      </p>

      <div className="flex flex-wrap gap-4">
        {/* Tune picker grouped by artist. */}
        <div className="max-h-[28rem] w-56 shrink-0 overflow-auto rounded bg-neutral-900/60 p-2 text-sm">
          <label className="mb-2 block cursor-pointer rounded bg-neutral-800 px-2 py-1 text-center text-xs hover:bg-neutral-700">
            Load .gp file…
            <input type="file" accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gtp,.musicxml,.xml" onChange={onFile} className="hidden" />
          </label>
          {tunes.length === 0 && <div className="text-xs text-neutral-500">No corpus found.</div>}
          {Object.entries(byArtist).map(([artist, list]) => (
            <div key={artist} className="mb-2">
              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-amber-400/80">{artist}</div>
              {list.map(t => (
                <button key={t.file} onClick={() => loadTune(t)}
                  className={`block w-full truncate rounded px-2 py-0.5 text-left ${current?.file === t.file ? "bg-emerald-700/60" : "hover:bg-neutral-800"}`}
                >{t.title}</button>
              ))}
            </div>
          ))}
        </div>

        {/* Recording + notation. */}
        <div className="min-w-0 flex-1">
          {current && (
            <div className="mb-2">
              <div className="mb-1 text-sm"><span className="font-medium">{current.title}</span> <span className="text-neutral-400">· {current.artist}</span></div>
              {current.vid ? (
                <iframe
                  className="aspect-video w-full max-w-xl rounded"
                  src={`https://www.youtube-nocookie.com/embed/${current.vid}`}
                  title={`${current.artist} — ${current.title}`}
                  allow="accelerometer; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <a href={current.youtube} target="_blank" rel="noreferrer" className="inline-block rounded bg-red-700/80 px-3 py-1.5 text-sm hover:bg-red-600">
                  ▶ Listen to the actual recording on YouTube
                </a>
              )}
            </div>
          )}
          {status && <div className="mb-1 text-xs text-amber-400">{status}</div>}
          <div ref={hostRef} className="overflow-auto rounded bg-white p-2" />
        </div>
      </div>
    </div>
  );
}
