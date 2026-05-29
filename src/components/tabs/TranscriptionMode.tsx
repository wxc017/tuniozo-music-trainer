// ── Transcription Mode ─────────────────────────────────────────────
// Anytune-style transcription player.  Browse:
//   • the existing local corpus (public/transcriptions/*.json)
//   • a folder of audio files you grant access to (File System Access API)
//   • files you drop into the page (persisted to IndexedDB)
//   • your Saved Phrases (from the Tonal-Audiation Transcriptions tab)
// Pick a track and the right pane shows a WaveSurfer waveform + a
// transport with pitch-preserving slowdown, A/B loop, and named
// checkpoints — all persisted per song to localStorage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import { createRubberBandNode } from "rubberband-web";
import type { RubberBandNode } from "rubberband-web";
import { useLS } from "@/lib/storage";
import { loadIndex, loadItemById } from "@/lib/transcriptions/loader";
import type { TxIndex, TxIndexEntry, TxItem, TxSource } from "@/lib/transcriptions/types";
import { SOURCE_LABEL, isAudioSource } from "@/lib/transcriptions/types";

const BASE = import.meta.env.BASE_URL ?? "/";
const RB_WORKLET_URL = `${BASE}rubberband-processor.js`;

// ── IndexedDB: dropped-file blobs + folder handles ─────────────────
const DB_NAME = "lt-transcription";
const FILE_STORE = "droppedFiles";
const HANDLE_STORE = "folderHandles";

interface DroppedFile { id: string; name: string; type: string; blob: Blob; addedAt: number }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(store: string, key: IDBValidKey | undefined, value: T) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    if (key === undefined) s.put(value); else s.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store: string, key: IDBValidKey) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Track abstraction ──────────────────────────────────────────────
// Three tabs: Corpus (read-only library), Files (user-supplied — both
// granted folders and dropped files), Saved phrases.
type SourceTab = "corpus" | "files" | "saved";
interface SavedFolder { id: string; name: string; handle: FileSystemDirectoryHandle }

interface Track {
  /** Stable id for per-song state keying. */
  id: string;
  title: string;
  artist?: string;
  /** Resolved playback URL (http path or blob: URL). */
  src: string;
  /** Optional source-kind label for the header. */
  source?: string;
  /** Optional cleanup (e.g. revokeObjectURL) called when this track is replaced. */
  cleanup?: () => void;
  /** Optional map of stem-name → URL, populated for tracks that have a
   *  pre-computed `<basename>.stems/` folder.  Drives mute/solo UI. */
  stems?: Partial<Record<StemName, string>>;
  /** Cleanup for any blob URLs created for the stems. */
  stemsCleanup?: () => void;
}

interface Checkpoint { id: string; label: string; time: number }

// Stems live in a sibling folder named `<basename>.stems/` (the
// output convention of scripts/separate-stems.mjs).  When a track is
// loaded the player checks for the canonical four — vocals/drums/
// bass/other — and exposes mute/solo for whichever ones are found.
type StemName = "vocals" | "drums" | "bass" | "other";
const STEM_NAMES: StemName[] = ["vocals", "drums", "bass", "other"];
const STEM_LABEL: Record<StemName, string> = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Other" };
const STEM_COLOR: Record<StemName, string> = {
  vocals: "#e8aa50", drums: "#7173e6", bass: "#5acc7a", other: "#aaa",
};
/** Corpus track the user has starred from inside the player. */
interface SavedSong {
  itemId: string; source: TxSource;
  title: string; artist?: string;
  savedAt: number;
}

// ── Audio path resolution for the existing corpus ──────────────────
function corpusAudioUrl(item: TxItem): string | null {
  if (!isAudioSource(item.source) || !item.audio) return null;
  // blues + drums clips live under their own folder at the same path the
  // Tonal-Audiation Transcriptions player uses.
  const folder = item.source === "drums" ? "drums" : "blues";
  return `${BASE}${folder}/${item.audio}`;
}

/** Return the canonical sibling stems folder URL for an audio URL, or
 *  null if the input doesn't look like a path we can derive from.
 *  e.g. "/blues/audio/abc.mp3" → "/blues/audio/abc.stems".  Blob URLs
 *  can't have implicit siblings, so they return null. */
function siblingStemsBase(audioUrl: string): string | null {
  if (audioUrl.startsWith("blob:")) return null;
  return audioUrl.replace(/\.[^/.]+$/, ".stems");
}

/** Check whether a stems folder exists by HEAD-ing each stem.  Returns
 *  a map of the stems that are present so the player can render mute
 *  buttons only for the available ones.  Verifies Content-Type so the
 *  Vite dev server's SPA index.html fallback (200 OK + text/html for
 *  unknown routes) doesn't get misread as audio. */
async function probeStems(stemsBase: string): Promise<Partial<Record<StemName, string>>> {
  const result: Partial<Record<StemName, string>> = {};
  await Promise.all(STEM_NAMES.map(async name => {
    const url = `${stemsBase}/${name}.wav`;
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (!r.ok) return;
      const ct = r.headers.get("content-type") ?? "";
      if (!/audio|application\/octet-stream|wav/i.test(ct)) return;
      result[name] = url;
    } catch { /* not present */ }
  }));
  return result;
}

// ── mm:ss formatter ───────────────────────────────────────────────
function mmss(t: number): string {
  if (!isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────
export default function TranscriptionMode() {
  // ── Source list state ──────────────────────────────────────────
  // (v2 key — the v1 key encoded the legacy folder/dropped tabs which
  // no longer exist after they were merged into "files".)
  const [sourceTab, setSourceTab] = useLS<SourceTab>("lt_trx_sourceTab_v2", "corpus");
  const [corpus, setCorpus] = useState<TxIndexEntry[]>([]);
  const [corpusReady, setCorpusReady] = useState(false);
  const [corpusQuery, setCorpusQuery] = useState("");
  const [corpusSource, setCorpusSource] = useState<TxSource | "all">("all");

  const [dropped, setDropped] = useState<DroppedFile[]>([]);
  // Multiple folders — keyed by id, each with its own enumerated entries.
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [folderEntries, setFolderEntries] = useState<Record<string, { name: string; handle: FileSystemFileHandle }[]>>({});
  const [folderNeedsRegrant, setFolderNeedsRegrant] = useState<Record<string, boolean>>({});
  const [filesQuery, setFilesQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useLS<Record<string, boolean>>("lt_trx_collapsedFolders", {});
  // Per-corpus-id hide list, scoped to this player's source list.
  const [hiddenCorpus, setHiddenCorpus] = useLS<Record<string, boolean>>("lt_trx_hiddenCorpus", {});
  const [showHiddenCorpus, setShowHiddenCorpus] = useState(false);

  // Saved songs — corpus tracks the user has starred from inside this
  // player, so they're one click away in the Saved tab.  (Saved
  // phrases as a concept are gone; users save the full song instead.)
  const [savedSongs, setSavedSongs] = useLS<SavedSong[]>("lt_trx_savedSongs", []);

  // ── Selected track + WaveSurfer player ─────────────────────────
  const [track, setTrack] = useState<Track | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1.0);
  // Fixed zoom: main waveform stays zoomed in (~12 seconds visible)
  // and auto-centers on the playhead, while the minimap shows the
  // whole song.  No user-facing zoom control — matches Anytune's
  // single-purpose dual-strip layout.
  const minimapContainerRef = useRef<HTMLDivElement | null>(null);

  // ── High-quality pitch-preserving slowdown via Rubber Band WASM ──
  // The audio element plays at `playbackRate = speed` with native
  // pitch preservation OFF, so it sounds slowed and low-pitched.  The
  // Rubber Band realtime node then shifts pitch UP by 1/speed to
  // restore the original key.  This uses Rubber Band purely as a
  // pitch shifter (its most reliable realtime mode) and keeps the
  // audio element's currentTime advancing at the displayed speed so
  // WaveSurfer's cursor / loop logic stay correct.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rbNodeRef = useRef<RubberBandNode | null>(null);
  const rbReadyRef = useRef(false);
  const [rbStatus, setRbStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const regionsRef = useRef<RegionsPlugin | null>(null);

  // ── Stems: parallel HTMLAudioElements, gated by GainNode mute ──
  // When a track has a `.stems/` folder we additionally instantiate
  // one HTMLAudioElement per stem and run them in lockstep with the
  // main element (which keeps driving WaveSurfer's playhead).  Each
  // stem's GainNode lets the user mute / solo it instantly.
  const stemAudioRefs = useRef<Partial<Record<StemName, HTMLAudioElement>>>({});
  const stemGainRefs = useRef<Partial<Record<StemName, GainNode>>>({});
  const [stemMuted, setStemMuted] = useState<Partial<Record<StemName, boolean>>>({});
  const [stemSolo, setStemSolo] = useState<StemName | null>(null);

  // Lazy init Rubber Band on first user gesture (autoplay policy
  // requires a gesture to resume the AudioContext).  Falls back to
  // native `preservesPitch` if the worklet fails to load.
  const initRubberBand = useCallback(async () => {
    if (rbReadyRef.current || !audioRef.current) return;
    setRbStatus("loading");
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      // MediaElementSource is a one-shot bond — once created, the audio
      // element can only output through this node for the rest of its
      // life.  That's fine: we reuse the same hidden <audio> across
      // tracks (only swap `src`).
      if (!mediaSrcRef.current) {
        mediaSrcRef.current = ctx.createMediaElementSource(audioRef.current);
      }
      const rb = await createRubberBandNode(ctx, RB_WORKLET_URL);
      rb.setHighQuality(true);
      rb.setTempo(1);
      rb.setPitch(1);
      mediaSrcRef.current.connect(rb);
      rb.connect(ctx.destination);
      rbNodeRef.current = rb;
      rbReadyRef.current = true;
      // Disable browser-native time-stretching; Rubber Band handles
      // pitch correction for our playback-rate-driven slowdown.
      (audioRef.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
      // Apply current speed immediately.
      audioRef.current.playbackRate = speed;
      rb.setPitch(1 / speed);
      setRbStatus("ready");
    } catch (err) {
      console.warn("Rubber Band worklet failed to load — falling back to native preservesPitch", err);
      if (audioRef.current) {
        (audioRef.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        audioRef.current.playbackRate = speed;
      }
      setRbStatus("failed");
    }
  }, [speed]);

  // Per-song persisted state (checkpoints + A/B loop endpoints).
  const [checkpointsAll, setCheckpointsAll] = useLS<Record<string, Checkpoint[]>>("lt_trx_checkpoints", {});
  const [loopsAll, setLoopsAll] = useLS<Record<string, [number, number] | null>>("lt_trx_loops", {});

  const checkpoints = track ? (checkpointsAll[track.id] ?? []) : [];
  const loop = track ? (loopsAll[track.id] ?? null) : null;

  // ── Load the corpus index on mount ─────────────────────────────
  useEffect(() => {
    loadIndex().then((idx: TxIndex) => { setCorpus(idx.items); setCorpusReady(true); }).catch(() => setCorpusReady(true));
  }, []);

  // Clean up Rubber Band + AudioContext on unmount.
  useEffect(() => {
    return () => {
      try { rbNodeRef.current?.close(); } catch { /* ignore */ }
      rbNodeRef.current = null;
      try { mediaSrcRef.current?.disconnect(); } catch { /* ignore */ }
      mediaSrcRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      rbReadyRef.current = false;
    };
  }, []);

  // ── Load dropped files + restore folder handles on mount ────────
  useEffect(() => {
    idbGetAll<DroppedFile>(FILE_STORE).then(setDropped).catch(() => {});
    (async () => {
      try {
        const saved = await idbGetAll<SavedFolder & { __id?: string }>(HANDLE_STORE);
        const list: SavedFolder[] = [];
        const needsRegrant: Record<string, boolean> = {};
        for (const s of saved) {
          if (!s?.handle) continue;
          const entry: SavedFolder = { id: s.id ?? s.__id ?? s.name, name: s.name, handle: s.handle };
          list.push(entry);
          const handleWithPerm = entry.handle as unknown as { queryPermission?: (o: { mode: string }) => Promise<PermissionState> };
          try {
            const perm = handleWithPerm.queryPermission ? await handleWithPerm.queryPermission({ mode: "read" }) : "prompt";
            if (perm === "granted") await listFolder(entry);
            else needsRegrant[entry.id] = true;
          } catch {
            needsRegrant[entry.id] = true;
          }
        }
        setFolders(list);
        setFolderNeedsRegrant(needsRegrant);
      } catch { /* no saved folders */ }
    })();
  }, []);

  // ── Drag-and-drop into the dropped section ─────────────────────
  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])];
    const audio = files.filter(f => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|flac|ogg|opus|aac)$/i.test(f.name));
    if (audio.length === 0) return;
    const added: DroppedFile[] = [];
    for (const f of audio) {
      const entry: DroppedFile = { id: crypto.randomUUID(), name: f.name, type: f.type || "audio/mpeg", blob: f, addedAt: Date.now() };
      await idbPut(FILE_STORE, undefined, entry);
      added.push(entry);
    }
    setDropped(prev => [...prev, ...added]);
    setSourceTab("files");
  }, [setSourceTab]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); };

  // ── Folder picker (File System Access API) ──────────────────────
  const listFolder = async (folder: SavedFolder) => {
    const entries: { name: string; handle: FileSystemFileHandle }[] = [];
    const dirIter = folder.handle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> };
    for await (const [entryName, entry] of dirIter.entries()) {
      if (entry.kind === "file" && /\.(mp3|wav|m4a|flac|ogg|opus|aac|webm)$/i.test(entryName)) {
        entries.push({ name: entryName, handle: entry as FileSystemFileHandle });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    setFolderEntries(prev => ({ ...prev, [folder.id]: entries }));
    setFolderNeedsRegrant(prev => ({ ...prev, [folder.id]: false }));
  };

  const pickFolder = async () => {
    const w = window as unknown as { showDirectoryPicker?: (options?: { mode: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> };
    if (!w.showDirectoryPicker) {
      alert("Folder picker requires Chrome or Edge (File System Access API).  Drag-and-drop into this panel as a cross-browser alternative.");
      return;
    }
    try {
      const handle = await w.showDirectoryPicker({ mode: "read" });
      const name = (handle as unknown as { name: string }).name;
      const id = crypto.randomUUID();
      const folder: SavedFolder = { id, name, handle };
      await idbPut(HANDLE_STORE, id, folder);
      setFolders(prev => [...prev.filter(f => f.id !== id), folder]);
      await listFolder(folder);
      setSourceTab("files");
    } catch { /* user cancelled */ }
  };

  const regrantFolder = async (folder: SavedFolder) => {
    const handleWithPerm = folder.handle as unknown as { requestPermission?: (o: { mode: string }) => Promise<PermissionState> };
    try {
      const perm = handleWithPerm.requestPermission ? await handleWithPerm.requestPermission({ mode: "read" }) : "denied";
      if (perm === "granted") await listFolder(folder);
    } catch { /* user denied */ }
  };

  const removeFolder = async (folder: SavedFolder) => {
    if (!confirm(`Remove "${folder.name}" from the list? (Files on disk are untouched.)`)) return;
    await idbDelete(HANDLE_STORE, folder.id);
    setFolders(prev => prev.filter(f => f.id !== folder.id));
    setFolderEntries(prev => { const n = { ...prev }; delete n[folder.id]; return n; });
    setFolderNeedsRegrant(prev => { const n = { ...prev }; delete n[folder.id]; return n; });
  };

  const toggleFolderCollapsed = (id: string) => {
    setCollapsedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Track selection ────────────────────────────────────────────
  const selectCorpus = async (entry: TxIndexEntry) => {
    if (!isAudioSource(entry.source)) {
      alert("This corpus entry has no playable audio (notated source — open it from Tonal Audiation).");
      return;
    }
    const item = await loadItemById(entry.id, entry.source);
    if (!item) { alert("Could not load this corpus entry."); return; }
    const url = corpusAudioUrl(item);
    if (!url) { alert("This corpus entry has no playable audio file."); return; }
    const base = siblingStemsBase(url);
    const stems = base ? await probeStems(base) : {};
    setTrack({ id: `corpus:${item.id}`, title: item.title, artist: item.artist, src: url, source: SOURCE_LABEL[item.source], stems });
  };

  const selectDropped = (d: DroppedFile) => {
    const url = URL.createObjectURL(d.blob);
    setTrack({ id: `dropped:${d.id}`, title: d.name, src: url, source: "Dropped file", cleanup: () => URL.revokeObjectURL(url) });
  };

  const selectFolder = async (folderId: string, e: { name: string; handle: FileSystemFileHandle }) => {
    try {
      const file = await e.handle.getFile();
      const url = URL.createObjectURL(file);
      const fname = folders.find(f => f.id === folderId)?.name ?? "Folder";
      setTrack({ id: `folder:${folderId}:${e.name}`, title: e.name, src: url, source: fname, cleanup: () => URL.revokeObjectURL(url) });
    } catch {
      alert("Could not read this file — permission may have been revoked.");
    }
  };

  const removeDropped = async (id: string) => {
    await idbDelete(FILE_STORE, id);
    setDropped(prev => prev.filter(d => d.id !== id));
    if (track?.id === `dropped:${id}`) { track.cleanup?.(); setTrack(null); }
  };

  // Hide a corpus entry from the picker (local LS preference only —
  // does not touch the corpus files).  Toggleable via "Show hidden".
  const toggleHiddenCorpus = (id: string) => {
    setHiddenCorpus(prev => {
      const n = { ...prev };
      if (n[id]) delete n[id]; else n[id] = true;
      return n;
    });
  };

  // Star/unstar the currently loaded corpus track.  Saved songs are
  // pinned to the top of the Saved tab so they're one click away.
  const currentSavedSongKey: string | null = useMemo(() => {
    if (!track) return null;
    if (!track.id.startsWith("corpus:")) return null;
    return track.id.slice("corpus:".length);
  }, [track]);
  const isCurrentSongSaved = useMemo(
    () => !!currentSavedSongKey && savedSongs.some(s => s.itemId === currentSavedSongKey),
    [currentSavedSongKey, savedSongs],
  );
  const toggleSaveCurrentSong = () => {
    if (!track || !currentSavedSongKey) return;
    const entry = corpus.find(c => c.id === currentSavedSongKey);
    if (!entry) return;
    setSavedSongs(prev => {
      const exists = prev.some(s => s.itemId === currentSavedSongKey);
      if (exists) return prev.filter(s => s.itemId !== currentSavedSongKey);
      return [...prev, { itemId: entry.id, source: entry.source, title: entry.title, artist: entry.artist, savedAt: Date.now() }];
    });
  };
  const removeSavedSong = (itemId: string) => {
    setSavedSongs(prev => prev.filter(s => s.itemId !== itemId));
  };
  const playSavedSong = (s: SavedSong) => {
    const entry = corpus.find(c => c.id === s.itemId);
    if (!entry) { alert("This saved song is no longer in the corpus."); return; }
    void selectCorpus(entry);
  };

  // ── WaveSurfer init when track changes ─────────────────────────
  useEffect(() => {
    if (!track || !containerRef.current || !audioRef.current) return;
    // Tear down any previous wavesurfer instance.
    wsRef.current?.destroy();
    wsRef.current = null;

    const audio = audioRef.current;
    audio.src = track.src;
    audio.crossOrigin = "anonymous";
    // If Rubber Band is already wired up, it handles pitch correction
    // and we leave native preservesPitch OFF.  Otherwise default to
    // native preservesPitch so slowdown still works pre-init.
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = !rbReadyRef.current;
    audio.playbackRate = speed;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;
    const plugins: ReturnType<typeof RegionsPlugin.create>[] = [regions as unknown as ReturnType<typeof RegionsPlugin.create>];
    // Timeline on top of the main waveform — seconds ticks help locate
    // checkpoints by time.
    plugins.push(TimelinePlugin.create({
      height: 18,
      timeInterval: 1,
      primaryLabelInterval: 5,
      style: { fontSize: "10px", color: "#888" },
    }) as unknown as ReturnType<typeof RegionsPlugin.create>);
    // Minimap = full-song overview rendered below the main waveform.
    // Click/drag inside it to navigate, just like Anytune's bottom
    // strip.  Mirrors the main waveform's blue gradient + bar shape so
    // it reads as the same waveform, just zoomed out.
    if (minimapContainerRef.current) {
      plugins.push(MinimapPlugin.create({
        container: minimapContainerRef.current,
        height: 44,
        waveColor: ["#5a8fc8", "#3a6fa8", "#1f4f88"],
        progressColor: ["#a3c6ec", "#7aabd6", "#5a8fc8"],
        cursorColor: "#ff5a3a",
        cursorWidth: 1,
        barWidth: 1,
        barGap: 0,
        barRadius: 1,
        normalize: true,
        overlayColor: "rgba(212,160,80,0.22)",
      }) as unknown as ReturnType<typeof RegionsPlugin.create>);
    }
    // Anytune-style colors: cool blue stems with a brighter blue
    // progress fill, a thin amber cursor, and stereo-mirrored bars.
    const ws = WaveSurfer.create({
      container: containerRef.current,
      media: audio,
      waveColor: ["#5a8fc8", "#3a6fa8", "#1f4f88"],
      progressColor: ["#a3c6ec", "#7aabd6", "#5a8fc8"],
      cursorColor: "#ff5a3a",
      cursorWidth: 2,
      height: 200,
      barWidth: 2,
      barGap: 0,
      barRadius: 1,
      normalize: true,
      // Auto-scroll + auto-center keep the playhead in view so the
      // zoomed view slides under the cursor like Anytune's content
      // view.  (The min-w-0 / overflow-hidden on the parent section
      // prevents the earlier layout-feedback loop these used to cause.)
      autoScroll: true,
      autoCenter: true,
      plugins,
    });
    wsRef.current = ws;

    const onReady = () => setDuration(ws.getDuration());
    const onTime = (t: number) => setCurrentTime(t);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    ws.on("ready", onReady);
    ws.on("timeupdate", onTime);
    ws.on("play", onPlay);
    ws.on("pause", onPause);

    return () => {
      ws.un("ready", onReady);
      ws.un("timeupdate", onTime);
      ws.un("play", onPlay);
      ws.un("pause", onPause);
      ws.destroy();
      wsRef.current = null;
      audio.pause();
      track.cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  // Apply speed live without rebuilding the wavesurfer.  When Rubber
  // Band is active we also push the inverse ratio to its pitch so
  // playback stays in the original key while the audio slows.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
    if (rbReadyRef.current && rbNodeRef.current) {
      rbNodeRef.current.setPitch(1 / speed);
    }
  }, [speed]);

  // Apply a fixed zoom (px/s) to the main waveform as soon as it
  // knows its duration.  ~2.5s visible — tight enough to see
  // individual note attacks (like Anytune's "content view").  The
  // minimap below provides the full-song overview.  Deferred to rAF
  // so the container has its final width when we measure it.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || duration <= 0) return;
    const raf = requestAnimationFrame(() => {
      const containerWidth = containerRef.current?.clientWidth ?? 800;
      const visibleSeconds = 2.5;
      const pxPerSec = containerWidth / visibleSeconds;
      try { ws.zoom(pxPerSec); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [duration, track?.id]);

  // ── Stem playback wiring ─────────────────────────────────────
  // When the active track has a stems map we instantiate one hidden
  // <audio> per stem, route each through a GainNode for instant
  // mute/solo, and keep them in lockstep with the main element by
  // mirroring play/pause/seek/rate.  The main element is silenced
  // (gain=0 on its Rubber Band path is heavier than just muting it
  // directly, so we just set its volume to 0 while stems play).
  useEffect(() => {
    const audio = audioRef.current;
    const main = audio;
    if (!main || !track) return;
    const stems = track.stems ?? {};
    const stemNames = STEM_NAMES.filter(n => !!stems[n]);
    // Reset previous stem audio elements.
    for (const el of Object.values(stemAudioRefs.current)) el?.pause();
    stemAudioRefs.current = {};
    stemGainRefs.current = {};
    setStemMuted({});
    setStemSolo(null);
    if (stemNames.length === 0) {
      // No stems → main audio plays normally.
      main.volume = 1;
      return;
    }
    // Stems present → main audio drives timing but is silenced.
    main.volume = 0;
    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;
    for (const name of stemNames) {
      const el = new Audio();
      el.crossOrigin = "anonymous";
      el.src = stems[name]!;
      el.preservesPitch = false;
      el.preload = "auto";
      el.playbackRate = main.playbackRate;
      const src = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      // Route stems through Rubber Band if it's ready so pitch
      // correction matches the slowdown.  If not ready yet, send
      // straight to destination — the user can flip to RB on play.
      if (rbNodeRef.current) gain.connect(rbNodeRef.current); else gain.connect(ctx.destination);
      stemAudioRefs.current[name] = el;
      stemGainRefs.current[name] = gain;
    }
    // Keep stems in lockstep with the main element.
    const onPlay = () => { for (const el of Object.values(stemAudioRefs.current)) el?.play().catch(() => {}); };
    const onPause = () => { for (const el of Object.values(stemAudioRefs.current)) el?.pause(); };
    const onSeeked = () => { for (const el of Object.values(stemAudioRefs.current)) { if (el) el.currentTime = main.currentTime; } };
    const onRate = () => { for (const el of Object.values(stemAudioRefs.current)) { if (el) el.playbackRate = main.playbackRate; } };
    main.addEventListener("play", onPlay);
    main.addEventListener("pause", onPause);
    main.addEventListener("seeked", onSeeked);
    main.addEventListener("ratechange", onRate);
    return () => {
      main.addEventListener("play", onPlay); // no-op match to satisfy ESLint if added later
      main.removeEventListener("play", onPlay);
      main.removeEventListener("pause", onPause);
      main.removeEventListener("seeked", onSeeked);
      main.removeEventListener("ratechange", onRate);
      for (const el of Object.values(stemAudioRefs.current)) el?.pause();
      stemAudioRefs.current = {};
      stemGainRefs.current = {};
      main.volume = 1;
    };
  }, [track?.id]);

  // Apply mute / solo state to stem gain nodes.
  useEffect(() => {
    for (const name of STEM_NAMES) {
      const g = stemGainRefs.current[name];
      if (!g) continue;
      const audible = stemSolo ? stemSolo === name : !stemMuted[name];
      g.gain.value = audible ? 1 : 0;
    }
  }, [stemMuted, stemSolo]);

  // ── A/B loop enforcement ──────────────────────────────────────
  useEffect(() => {
    if (!loop || !audioRef.current) return;
    const audio = audioRef.current;
    const [a, b] = loop;
    const onTime = () => {
      if (audio.currentTime >= b) audio.currentTime = a;
      else if (audio.currentTime < a) audio.currentTime = a;
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [loop]);

  // ── Sync checkpoint markers + A/B loop region onto the waveform ──
  // Markers (no `end`) render as a thin vertical line.  We tag each
  // with `id="cp:<cpId>"` so re-renders can find and remove them.
  // Clicking a marker seeks; clicking the loop region just lights up.
  useEffect(() => {
    const regions = regionsRef.current; const ws = wsRef.current;
    if (!regions || !ws || duration <= 0) return;

    const clickHandlers = new Map<Region, (e: MouseEvent) => void>();
    const onRegionClick = (region: Region, e: MouseEvent) => {
      e.stopPropagation();
      // Loop region (id starts with "loop:") shouldn't seek — only checkpoints do.
      if (region.id.startsWith("cp:") && audioRef.current) {
        audioRef.current.currentTime = region.start;
      }
    };
    regions.on("region-clicked", onRegionClick);

    // Wipe and re-add — cheap for the ~dozen markers a user typically has.
    regions.clearRegions();
    // A/B loop region: amber-tinted band sitting under the waveform
    // (matches Anytune's selection highlight).  Add this FIRST so the
    // checkpoint markers paint on top of it.
    if (loop) {
      regions.addRegion({
        id: "loop:ab", start: loop[0], end: loop[1],
        color: "rgba(232,170,80,0.28)", drag: false, resize: false,
      });
      const aFlag = document.createElement("div");
      aFlag.textContent = "A";
      aFlag.style.cssText = "font-size:11px;color:#0a0a08;background:#d4a050;padding:2px 8px;border-radius:0 3px 3px 0;font-weight:700;font-family:monospace;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.4);";
      regions.addRegion({ id: "loop:a", start: loop[0], color: "rgba(212,160,80,0)", drag: false, resize: false, content: aFlag });
      const bFlag = document.createElement("div");
      bFlag.textContent = "B";
      bFlag.style.cssText = "font-size:11px;color:#0a0a08;background:#d4a050;padding:2px 8px;border-radius:0 3px 3px 0;font-weight:700;font-family:monospace;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.4);";
      regions.addRegion({ id: "loop:b", start: loop[1], color: "rgba(212,160,80,0)", drag: false, resize: false, content: bFlag });
    }
    for (const cp of checkpoints) {
      const label = document.createElement("div");
      label.textContent = cp.label;
      label.style.cssText = "font-size:11px;color:#0a0a08;background:#e8aa50;padding:2px 6px;border-radius:0 4px 4px 0;font-weight:700;font-family:monospace;white-space:nowrap;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.5);";
      regions.addRegion({
        id: `cp:${cp.id}`, start: cp.time, color: "rgba(232,170,80,0.95)",
        drag: false, resize: false, content: label,
      });
    }
    return () => {
      regions.un("region-clicked", onRegionClick);
      clickHandlers.clear();
    };
  }, [checkpoints, loop, duration, track?.id]);

  // ── Controls ──────────────────────────────────────────────────
  const togglePlay = async () => {
    const audio = audioRef.current; if (!audio) return;
    if (audio.paused) {
      // First gesture: bring up the AudioContext + Rubber Band node.
      if (!rbReadyRef.current && rbStatus === "idle") await initRubberBand();
      // If a context exists but is suspended (background tab, etc.) resume it.
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume().catch(() => {});
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };
  const seekTo = (t: number) => { if (audioRef.current) audioRef.current.currentTime = t; };

  // Ctrl/Cmd-click two checkpoint timestamps to convert them into the
  // A/B loop endpoints — fast way to A-B between two marks without
  // touching the transport.  Holds up to two; the second click sets
  // the loop and clears the selection.
  const [pendingLoopMarks, setPendingLoopMarks] = useState<string[]>([]);
  const onCheckpointTimeClick = (cp: Checkpoint, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setPendingLoopMarks(prev => {
        const next = prev.includes(cp.id) ? prev.filter(id => id !== cp.id) : [...prev, cp.id];
        if (next.length === 2 && track) {
          const a = checkpoints.find(c => c.id === next[0]);
          const b = checkpoints.find(c => c.id === next[1]);
          if (a && b) {
            const [lo, hi] = a.time < b.time ? [a.time, b.time] : [b.time, a.time];
            setLoopsAll(prevL => ({ ...prevL, [track.id]: [lo, hi] }));
          }
          return [];
        }
        return next.slice(-2);
      });
    } else {
      seekTo(cp.time);
    }
  };

  // Jump to the previous / next checkpoint relative to the playhead
  // (the "Marks navigation" cluster on Anytune's transport bar).
  const jumpToMark = (dir: "prev" | "next") => {
    if (!audioRef.current || checkpoints.length === 0) return;
    const t = audioRef.current.currentTime;
    const sorted = [...checkpoints].sort((a, b) => a.time - b.time);
    if (dir === "next") {
      const next = sorted.find(c => c.time > t + 0.05);
      if (next) seekTo(next.time);
    } else {
      const prev = [...sorted].reverse().find(c => c.time < t - 0.5);
      if (prev) seekTo(prev.time); else seekTo(sorted[0].time);
    }
  };

  const setLoopEnd = (which: "A" | "B") => {
    if (!track || !audioRef.current) return;
    const t = audioRef.current.currentTime;
    setLoopsAll(prev => {
      const cur = prev[track.id] ?? [0, duration];
      const next: [number, number] = which === "A" ? [t, Math.max(t + 0.5, cur[1])] : [Math.min(cur[0], t - 0.5), t];
      return { ...prev, [track.id]: next };
    });
  };
  const clearLoop = () => {
    if (!track) return;
    setLoopsAll(prev => { const n = { ...prev }; delete n[track.id]; return n; });
  };

  const addCheckpoint = () => {
    if (!track || !audioRef.current) return;
    const t = audioRef.current.currentTime;
    const cp: Checkpoint = { id: crypto.randomUUID(), label: mmss(t), time: t };
    setCheckpointsAll(prev => ({ ...prev, [track.id]: [...(prev[track.id] ?? []), cp].sort((a, b) => a.time - b.time) }));
  };
  const renameCheckpoint = (cpId: string, label: string) => {
    if (!track) return;
    setCheckpointsAll(prev => ({ ...prev, [track.id]: (prev[track.id] ?? []).map(c => c.id === cpId ? { ...c, label } : c) }));
  };
  const removeCheckpoint = (cpId: string) => {
    if (!track) return;
    setCheckpointsAll(prev => ({ ...prev, [track.id]: (prev[track.id] ?? []).filter(c => c.id !== cpId) }));
  };

  // ── Derived corpus list (audio only — folder/dropped covers BYO) ─
  const playableCorpus = useMemo(
    () => corpus.filter(c => isAudioSource(c.source)),
    [corpus],
  );

  const filteredCorpus = useMemo(() => {
    let pool = playableCorpus;
    if (!showHiddenCorpus) pool = pool.filter(c => !hiddenCorpus[c.id]);
    if (corpusSource !== "all") pool = pool.filter(c => c.source === corpusSource);
    const q = corpusQuery.trim().toLowerCase();
    if (q) pool = pool.filter(c => c.title.toLowerCase().includes(q) || (c.artist ?? "").toLowerCase().includes(q));
    return pool;
  }, [playableCorpus, corpusSource, corpusQuery, hiddenCorpus, showHiddenCorpus]);

  // Search across both dropped files and folder entries for the merged Files tab.
  const filteredDropped = useMemo(() => {
    const q = filesQuery.trim().toLowerCase();
    if (!q) return dropped;
    return dropped.filter(d => d.name.toLowerCase().includes(q));
  }, [dropped, filesQuery]);

  const filteredFolderEntries = useMemo(() => {
    const q = filesQuery.trim().toLowerCase();
    if (!q) return folderEntries;
    const result: Record<string, { name: string; handle: FileSystemFileHandle }[]> = {};
    for (const [id, list] of Object.entries(folderEntries)) {
      result[id] = list.filter(e => e.name.toLowerCase().includes(q));
    }
    return result;
  }, [folderEntries, filesQuery]);

  const corpusSourceOptions = useMemo(() => {
    const set = new Set<TxSource>();
    for (const c of playableCorpus) set.add(c.source);
    return [...set].sort();
  }, [playableCorpus]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-3" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
        {/* ── LEFT: source picker ───────────────────────────────── */}
        <aside className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
          <div className="flex border-b border-[#1a1a1a]">
            {(["corpus", "files", "saved"] as SourceTab[]).map(t => (
              <button key={t} onClick={() => setSourceTab(t)}
                className={`flex-1 px-2 py-2 text-[10px] font-semibold tracking-widest uppercase transition-colors ${
                  sourceTab === t ? "bg-[#1a1408] text-[#d4a050]" : "text-[#666] hover:text-[#aaa]"
                }`}>
                {t === "corpus" ? "Corpus" : t === "files" ? "Files" : "Saved"}
              </button>
            ))}
          </div>

          {sourceTab === "corpus" && (
            <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
              <input
                type="text" placeholder="Search title / artist…"
                value={corpusQuery} onChange={e => setCorpusQuery(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-[#0a0a0a] border border-[#1f1f1f] rounded text-[#ddd] outline-none focus:border-[#3a3a3a]"
              />
              <select value={corpusSource} onChange={e => setCorpusSource(e.target.value as TxSource | "all")}
                className="w-full px-2 py-1.5 text-xs bg-[#0a0a0a] border border-[#1f1f1f] rounded text-[#aaa] outline-none focus:border-[#3a3a3a]">
                <option value="all">All sources ({playableCorpus.length})</option>
                {corpusSourceOptions.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[10px] text-[#888] cursor-pointer select-none">
                <input type="checkbox" checked={showHiddenCorpus} onChange={e => setShowHiddenCorpus(e.target.checked)} className="accent-[#d4a050]" />
                Show hidden ({Object.keys(hiddenCorpus).length})
              </label>
              <div className="flex-1 overflow-y-auto -mx-2 px-2">
                {!corpusReady ? <p className="text-[11px] text-[#666]">Loading corpus…</p>
                  : filteredCorpus.length === 0 ? <p className="text-[11px] text-[#666]">No matching tracks.</p>
                  : (
                    <ul className="space-y-0.5">
                      {filteredCorpus.slice(0, 500).map(it => {
                        const isHidden = !!hiddenCorpus[it.id];
                        return (
                          <li key={it.id} className="flex items-stretch gap-1">
                            <button onClick={() => void selectCorpus(it)}
                              className={`flex-1 text-left px-2 py-1 rounded text-[11px] transition-colors min-w-0 ${
                                track?.id === `corpus:${it.id}` ? "bg-[#1a1408] text-[#d4a050]"
                                  : isHidden ? "text-[#555] hover:bg-[#141414] italic"
                                  : "text-[#bbb] hover:bg-[#161616]"
                              }`}>
                              <div className="truncate">{it.title}</div>
                              <div className="text-[10px] text-[#666] truncate">{it.artist ?? ""}{it.artist ? " · " : ""}{SOURCE_LABEL[it.source]}</div>
                            </button>
                            <button onClick={() => toggleHiddenCorpus(it.id)}
                              title={isHidden ? "Unhide this track" : "Hide this track from the list"}
                              className={`px-1.5 text-[12px] rounded shrink-0 ${
                                isHidden ? "text-[#5acc7a] hover:bg-[#0a1a0e]" : "text-[#666] hover:text-[#a66] hover:bg-[#1a0a0a]"
                              }`}>
                              {isHidden ? "+" : "×"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                {corpusReady && filteredCorpus.length > 500 && (
                  <p className="text-[10px] text-[#555] mt-2">… {filteredCorpus.length - 500} more — refine the search.</p>
                )}
              </div>
            </div>
          )}

          {sourceTab === "files" && (
            <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
              <div className="flex items-center gap-2">
                <button onClick={pickFolder}
                  className="px-2 py-1.5 text-[10px] font-semibold tracking-widest uppercase bg-[#1a1408] border border-[#3a2e1a] text-[#d4a050] rounded hover:bg-[#2a2010]"
                  title="Grant access to a folder of audio (Chrome / Edge).  You can add multiple.">
                  + Folder
                </button>
                <span className="text-[10px] text-[#666]">or drop files here</span>
              </div>
              {(folders.length > 0 || dropped.length > 0) && (
                <input
                  type="text" placeholder="Search files…"
                  value={filesQuery} onChange={e => setFilesQuery(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-[#0a0a0a] border border-[#1f1f1f] rounded text-[#ddd] outline-none focus:border-[#3a3a3a]"
                />
              )}
              <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
                {folders.length === 0 && dropped.length === 0 && (
                  <p className="text-[11px] text-[#666] leading-relaxed">
                    Pick a folder to grant the app read-only access to its audio (Chrome / Edge), or drag audio files anywhere on this page to add them.
                    Files are not uploaded — they stream from your disk / browser storage.
                  </p>
                )}

                {/* Folders — each is a collapsible group. */}
                {folders.map(folder => {
                  const entries = filteredFolderEntries[folder.id] ?? [];
                  const collapsed = collapsedFolders[folder.id];
                  const needsRegrant = folderNeedsRegrant[folder.id];
                  return (
                    <div key={folder.id} className="border border-[#1a1a1a] rounded">
                      <div className="flex items-center gap-1 px-1.5 py-1 bg-[#0a0a0a]">
                        <button onClick={() => toggleFolderCollapsed(folder.id)}
                          className="text-[10px] text-[#666] hover:text-[#aaa] w-4 text-center" title={collapsed ? "Expand" : "Collapse"}>
                          {collapsed ? "▸" : "▾"}
                        </button>
                        <span className="text-[10px] font-semibold tracking-wider text-[#d4a050] uppercase truncate flex-1" title={folder.name}>
                          {folder.name}
                        </span>
                        <span className="text-[9px] text-[#666]">{(folderEntries[folder.id]?.length ?? 0)}</span>
                        {needsRegrant && (
                          <button onClick={() => void regrantFolder(folder)} title="Re-grant access after page reload"
                            className="text-[9px] text-[#e8aa50] hover:text-white border border-[#3a2e1a] px-1.5 rounded">Re-grant</button>
                        )}
                        <button onClick={() => void removeFolder(folder)} title="Remove this folder from the list"
                          className="px-1 text-[#666] hover:text-[#a66] text-[12px]">×</button>
                      </div>
                      {!collapsed && (
                        <ul className="space-y-0.5 p-1">
                          {needsRegrant && entries.length === 0 ? (
                            <li className="px-2 py-1 text-[10px] text-[#666] italic">Click Re-grant to access this folder again.</li>
                          ) : entries.length === 0 ? (
                            <li className="px-2 py-1 text-[10px] text-[#666] italic">No audio files{filesQuery ? " match" : ""}.</li>
                          ) : entries.map(e => (
                            <li key={e.name}>
                              <button onClick={() => void selectFolder(folder.id, e)}
                                className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${
                                  track?.id === `folder:${folder.id}:${e.name}` ? "bg-[#1a1408] text-[#d4a050]" : "text-[#bbb] hover:bg-[#161616]"
                                }`}>
                                <div className="truncate">{e.name}</div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                {/* Dropped files — one flat group below the folders. */}
                {dropped.length > 0 && (
                  <div className="border border-[#1a1a1a] rounded">
                    <div className="px-1.5 py-1 bg-[#0a0a0a] flex items-center gap-1">
                      <span className="text-[10px] font-semibold tracking-wider text-[#7173e6] uppercase">Dropped Files</span>
                      <span className="text-[9px] text-[#666] ml-auto">{dropped.length}</span>
                    </div>
                    <ul className="space-y-0.5 p-1">
                      {filteredDropped.map(d => (
                        <li key={d.id} className="flex items-center gap-1">
                          <button onClick={() => selectDropped(d)}
                            className={`flex-1 text-left px-2 py-1 rounded text-[11px] transition-colors min-w-0 ${
                              track?.id === `dropped:${d.id}` ? "bg-[#1a1408] text-[#d4a050]" : "text-[#bbb] hover:bg-[#161616]"
                            }`}>
                            <div className="truncate">{d.name}</div>
                            <div className="text-[10px] text-[#666]">{(d.blob.size / (1024*1024)).toFixed(1)} MB</div>
                          </button>
                          <button onClick={() => removeDropped(d.id)} title="Remove"
                            className="px-1.5 py-1 text-[#a66] hover:text-[#d88] text-[12px]">×</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {sourceTab === "saved" && (
            <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
              <p className="text-[10px] text-[#666] leading-relaxed">
                Songs starred from inside this player, plus phrases bookmarked under Tonal Audiation → Transcriptions.
              </p>
              <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
                {/* Saved songs (corpus tracks starred from the player). */}
                {savedSongs.length > 0 && (
                  <div className="border border-[#1a1a1a] rounded">
                    <div className="px-1.5 py-1 bg-[#0a0a0a] flex items-center gap-1">
                      <span className="text-[10px] font-semibold tracking-wider text-[#d4a050] uppercase">★ Songs</span>
                      <span className="text-[9px] text-[#666] ml-auto">{savedSongs.length}</span>
                    </div>
                    <ul className="space-y-0.5 p-1">
                      {savedSongs.map(s => (
                        <li key={s.itemId} className="flex items-center gap-1">
                          <button onClick={() => playSavedSong(s)}
                            className={`flex-1 text-left px-2 py-1 rounded text-[11px] transition-colors min-w-0 ${
                              track?.id === `corpus:${s.itemId}` ? "bg-[#1a1408] text-[#d4a050]" : "text-[#bbb] hover:bg-[#161616]"
                            }`}>
                            <div className="truncate">{s.title}</div>
                            <div className="text-[10px] text-[#666] truncate">{s.artist ?? ""}{s.artist ? " · " : ""}{SOURCE_LABEL[s.source]}</div>
                          </button>
                          <button onClick={() => removeSavedSong(s.itemId)} title="Unstar"
                            className="px-1.5 py-1 text-[#666] hover:text-[#a66] text-[12px]">×</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {savedSongs.length === 0 && (
                  <p className="text-[11px] text-[#666]">Nothing saved yet — star a corpus track with the ☆ button in the player.</p>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ── RIGHT: player ───────────────────────────────────── */}
        <section className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-4 flex flex-col gap-4 min-h-[520px] min-w-0 overflow-hidden">
          {!track ? (
            <div className="flex-1 flex items-center justify-center text-center text-[#666] text-xs leading-relaxed">
              <div className="max-w-sm">
                <p className="mb-2">Pick a track from the left, drag a file onto this page, or grant access to a folder of audio.</p>
                <p className="text-[10px] text-[#444]">The player supports pitch-preserving slowdown, A/B loop, and named checkpoints — all saved per song.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2 min-w-0">
                  {currentSavedSongKey && (
                    <button onClick={toggleSaveCurrentSong}
                      title={isCurrentSongSaved ? "Unstar this song (removes it from Saved)" : "Star this song (adds it to Saved)"}
                      className={`text-lg leading-none shrink-0 ${isCurrentSongSaved ? "text-[#d4a050]" : "text-[#444] hover:text-[#d4a050]"}`}>
                      {isCurrentSongSaved ? "★" : "☆"}
                    </button>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white truncate">{track.title}</h3>
                    {(track.artist || track.source) && (
                      <p className="text-xs text-[#888] truncate">
                        {track.artist ? track.artist : ""}{track.artist && track.source ? " · " : ""}{track.source ?? ""}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs font-mono text-[#888]">{mmss(currentTime)} / {mmss(duration)}</p>
              </div>

              {/* Main zoomed waveform with timeline + checkpoint flags. */}
              <div ref={containerRef} className="bg-[#080808] rounded-t border border-[#1a1a1a] px-1 py-2 overflow-x-auto" />
              {/* Full-song minimap — click/drag to navigate, like Anytune's overview strip.
                  Time displays flank it: current on the left, time remaining on the right. */}
              <div className="flex items-center gap-3 bg-[#080808] rounded-b border border-t-0 border-[#1a1a1a] px-3 py-1.5">
                <span className="text-[11px] font-mono text-[#aaa] shrink-0 tabular-nums" title="Current time">
                  {mmss(currentTime)}
                </span>
                <div ref={minimapContainerRef} className="flex-1" />
                <span className="text-[11px] font-mono text-[#888] shrink-0 tabular-nums" title="Time remaining">
                  -{mmss(Math.max(0, duration - currentTime))}
                </span>
              </div>
              <audio ref={audioRef} preload="auto" className="hidden" />

              {/* Transport — Anytune-style: marks nav · play · A/B loop. */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-0.5">
                  <button onClick={() => jumpToMark("prev")} title="Previous mark"
                    disabled={checkpoints.length === 0}
                    className="px-2 py-2 text-[#aaa] hover:text-white border border-[#3a3a3a] rounded-l text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed">⏮</button>
                  <button onClick={togglePlay}
                    className="px-4 py-2 bg-[#7173e6] hover:bg-[#5a5cc8] text-white text-sm font-medium leading-none">
                    {playing ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => jumpToMark("next")} title="Next mark"
                    disabled={checkpoints.length === 0}
                    className="px-2 py-2 text-[#aaa] hover:text-white border border-[#3a3a3a] rounded-r text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed">⏭</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#888] tracking-wider">SPEED</span>
                  <input type="range" min={0.4} max={1.0} step={0.05} value={speed}
                    onChange={e => setSpeed(parseFloat(e.target.value))} className="accent-[#d4a050] w-28" />
                  <span className="text-[11px] font-mono text-[#d4a050] w-12 text-right">{(speed * 100).toFixed(0)}%</span>
                  <span className="text-[9px] tracking-widest uppercase text-[#666]"
                    title={rbStatus === "ready" ? "Rubber Band high-quality pitch correction is active."
                         : rbStatus === "loading" ? "Loading Rubber Band worklet…"
                         : rbStatus === "failed" ? "Rubber Band failed — using native preservesPitch."
                         : "Press play to engage Rubber Band high-quality pitch correction."}>
                    {rbStatus === "ready" ? "RUBBER BAND" : rbStatus === "loading" ? "LOADING…" : rbStatus === "failed" ? "NATIVE" : "NATIVE"}
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => setLoopEnd("A")} title="Set loop start to current time"
                    className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider border border-[#3a3a3a] text-[#aaa] hover:border-[#5a5a5a] hover:text-white rounded">A</button>
                  <button onClick={() => setLoopEnd("B")} title="Set loop end to current time"
                    className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider border border-[#3a3a3a] text-[#aaa] hover:border-[#5a5a5a] hover:text-white rounded">B</button>
                  {loop && (
                    <>
                      <span className="text-[10px] font-mono text-[#d4a050] px-2">{mmss(loop[0])}–{mmss(loop[1])}</span>
                      <button onClick={clearLoop} title="Clear loop"
                        className="px-2 py-1.5 text-[10px] uppercase tracking-wider border border-[#3a3a3a] text-[#a66] hover:text-[#d88] rounded">Clear</button>
                    </>
                  )}
                </div>
              </div>

              {/* Stems — only rendered when a sibling `.stems/` folder
                  was detected for the current track. */}
              {track.stems && Object.keys(track.stems).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">Stems</h4>
                    <span className="text-[10px] text-[#666]">
                      Click MUTE to silence · click SOLO to hear only that stem
                      {stemSolo && <button onClick={() => setStemSolo(null)} className="ml-2 text-[#d4a050] hover:text-white">clear solo</button>}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {STEM_NAMES.filter(n => !!track.stems?.[n]).map(name => {
                      const muted = !!stemMuted[name];
                      const soloed = stemSolo === name;
                      const audible = stemSolo ? soloed : !muted;
                      return (
                        <div key={name} className={`rounded border ${audible ? "border-[#3a3a3a]" : "border-[#1a1a1a]"} bg-[#0a0a0a] px-2 py-1.5 flex flex-col gap-1 items-stretch`}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: audible ? STEM_COLOR[name] : "#333" }} />
                            <span className={`text-[11px] font-semibold flex-1 ${audible ? "text-white" : "text-[#555] line-through"}`}>{STEM_LABEL[name]}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => setStemMuted(prev => ({ ...prev, [name]: !prev[name] }))}
                              className={`flex-1 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded ${muted ? "bg-[#2a1a1a] text-[#d88]" : "bg-[#0a0a0a] border border-[#2a2a2a] text-[#888] hover:text-white"}`}>
                              {muted ? "Muted" : "Mute"}
                            </button>
                            <button onClick={() => setStemSolo(prev => prev === name ? null : name)}
                              className={`flex-1 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded ${soloed ? "bg-[#1a1408] border border-[#d4a050] text-[#d4a050]" : "bg-[#0a0a0a] border border-[#2a2a2a] text-[#888] hover:text-white"}`}>
                              Solo
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Checkpoints */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">Checkpoints</h4>
                  <button onClick={addCheckpoint}
                    className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider bg-[#1a1408] border border-[#3a2e1a] text-[#d4a050] hover:bg-[#2a2010] rounded">
                    + Add at {mmss(currentTime)}
                  </button>
                </div>
                {checkpoints.length === 0 ? (
                  <p className="text-[11px] text-[#666]">No checkpoints yet — add markers at musically interesting spots and jump back to them.</p>
                ) : (
                  <>
                    <p className="text-[10px] text-[#666] mb-1">
                      Click the timestamp to seek.  <kbd className="text-[#aaa]">Ctrl</kbd>+click two timestamps to loop between them.
                      {pendingLoopMarks.length === 1 && <span className="text-[#d4a050]"> · One mark selected — Ctrl+click another to set the loop.</span>}
                    </p>
                    <ul className="space-y-1">
                      {checkpoints.map(cp => {
                        const isPending = pendingLoopMarks.includes(cp.id);
                        return (
                          <li key={cp.id} className={`flex items-center gap-2 px-2 py-1 rounded border ${isPending ? "border-[#d4a050] bg-[#1a1408]" : "border-[#1a1a1a] bg-[#0a0a0a]"}`}>
                            <button onClick={(e) => onCheckpointTimeClick(cp, e)}
                              title="Click to seek · Ctrl+click two marks to loop"
                              className={`px-2 py-0.5 text-[10px] font-mono rounded ${isPending ? "border border-[#d4a050] text-[#d4a050] bg-[#2a2010]" : "border border-[#3a2e1a] text-[#d4a050] hover:bg-[#1a1408]"}`}>
                              {mmss(cp.time)}
                            </button>
                            <input
                              type="text" value={cp.label} onChange={e => renameCheckpoint(cp.id, e.target.value)}
                              className="flex-1 px-1.5 py-0.5 text-[11px] bg-transparent border border-transparent text-[#ddd] outline-none focus:border-[#2a2a2a] rounded"
                            />
                            <button onClick={() => removeCheckpoint(cp.id)} title="Remove"
                              className="px-1 text-[#a66] hover:text-[#d88] text-[12px]">×</button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <p className="text-[10px] text-[#444] text-center">
        Drag audio files anywhere on this page · slowdown uses Rubber Band (WASM) for distortion-free pitch preservation down to 40&#37; speed · pre-compute stems with <code className="text-[#888]">npm run separate-stems</code> (MDX-Net) to enable mute/solo per instrument.
      </p>
    </div>
  );
}
