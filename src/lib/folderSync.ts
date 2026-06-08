// File System Access API sync: user picks a local folder once, the app
// persists a FileSystemDirectoryHandle in IndexedDB, and auto-writes a
// JSON snapshot of all music data on every change.
//
// The folder holds ONE container file (lumatone_practice_data.json) that can
// store MULTIPLE named saves. Auto-save targets the currently "active" save and
// leaves the others untouched, so a single folder is a small save library.
//
// Browser constraint: after every page reload the handle is still stored,
// but the permission must be re-requested via a user gesture. We expose
// this as a two-step flow (connect-once → reconnect-each-session).

import { buildSyncPayload, restoreFromSyncPayload } from "./syncData";
import { isExportKey } from "./storage";

const DB_NAME = "lt_folder_sync";
const STORE = "handles";
const HANDLE_KEY = "dir";
const DATA_FILENAME = "lumatone_practice_data.json";
const DEFAULT_SAVE_NAME = "My Data";
const LEGACY_SAVE_NAME = "Practice Data";

// ── Container format ───────────────────────────────────────────────────
// A single file holds named saves. Each slot is exactly the buildSyncPayload()
// shape, so restoreFromSyncPayload() loads a slot unchanged.

interface SyncPayload {
  version: number;
  exported?: string;
  data: Record<string, string>;
}
interface SaveContainer {
  version: 2;
  type: "lumatone-folder-saves";
  active: string;
  updated?: string;
  saves: Record<string, SyncPayload>;
}

function freshContainer(): SaveContainer {
  return { version: 2, type: "lumatone-folder-saves", active: "", saves: {} };
}

/** Parse the v2 container, or wrap a legacy single-save file, or return null. */
function parseContainer(text: string): SaveContainer | null {
  let p: any;
  try { p = JSON.parse(text); } catch { return null; }
  if (!p || typeof p !== "object") return null;
  if (p.type === "lumatone-folder-saves" && p.saves && typeof p.saves === "object") {
    return p as SaveContainer;
  }
  // Legacy single-save shape: { version:1, exported, data:{...} }
  if (p.data && typeof p.data === "object") {
    return {
      version: 2,
      type: "lumatone-folder-saves",
      active: LEGACY_SAVE_NAME,
      saves: { [LEGACY_SAVE_NAME]: p as SyncPayload },
    };
  }
  return null;
}

// ── IndexedDB handle store ───────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────

export type SyncState = "unsupported" | "disconnected" | "needs-permission" | "connected";

export interface SyncStatus {
  state: SyncState;
  folderName?: string;
  lastSaved?: number;
  lastError?: string;
  /** Names of all saves found in the connected folder's container. */
  saves?: string[];
  /** Name of the save auto-save currently writes to. */
  activeSave?: string;
}

export function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// Narrow types for File System Access API (TS lib.dom lacks these by default)
interface FSDirHandle {
  name: string;
  kind: "directory";
  queryPermission(desc: { mode: "readwrite" | "read" }): Promise<PermissionState>;
  requestPermission(desc: { mode: "readwrite" | "read" }): Promise<PermissionState>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>;
}
interface FSFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FSWritable>;
}
interface FSWritable {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

let cachedHandle: FSDirHandle | null = null;
let lastSavedAt: number | null = null;
let lastErrorMsg: string | null = null;
let connected = false;
// Which named save auto-save writes to. Null until a folder is connected.
let activeName: string | null = null;
// True while we're writing a folder-sourced payload INTO localStorage.
// scheduleSave early-returns in that window so the restore doesn't trigger
// a redundant round-trip back to the folder.
let suppressSave = false;

async function getHandle(): Promise<FSDirHandle | null> {
  if (cachedHandle) return cachedHandle;
  try {
    cachedHandle = await idbGet<FSDirHandle>(HANDLE_KEY);
    return cachedHandle;
  } catch { return null; }
}

export async function getStatus(): Promise<SyncStatus> {
  if (!isSupported()) return { state: "unsupported" };
  const handle = await getHandle();
  if (!handle) return { state: "disconnected" };
  const perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm === "granted") {
    const container = await readContainer(handle);
    const saves = container ? Object.keys(container.saves) : [];
    return {
      state: "connected",
      folderName: handle.name,
      lastSaved: lastSavedAt ?? undefined,
      lastError: lastErrorMsg ?? undefined,
      saves,
      activeSave: activeName ?? container?.active ?? undefined,
    };
  }
  return {
    state: "needs-permission",
    folderName: handle.name,
    lastError: lastErrorMsg ?? undefined,
  };
}

/** Prompt the user to pick a folder. If it already holds saves, returns
 *  `hasExistingData:true` and does NOT touch app data — the UI then prompts the
 *  user to overwrite (loadActiveSave) or save-as-new (saveCurrentAsNew).
 *  An empty folder is seeded with the current data under a default name. */
export async function connectFolder(): Promise<{ ok: boolean; error?: string; hasExistingData?: boolean; saves?: string[]; active?: string }> {
  if (!isSupported()) return { ok: false, error: "Folder sync not supported in this browser (needs Chrome/Edge)." };
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite",
      id: "lumatone-sync",
    }) as FSDirHandle;
    await idbPut(HANDLE_KEY, handle);
    cachedHandle = handle;

    const container = await readContainer(handle);
    if (container && Object.keys(container.saves).length > 0) {
      // Existing saves — leave app data alone and DON'T enable auto-save yet, so
      // an unanswered prompt can't silently overwrite a save. loadActiveSave /
      // saveCurrentAsNew turn `connected` on once the user chooses.
      connected = false;
      lastErrorMsg = null;
      emitStatus();
      return { ok: true, hasExistingData: true, saves: Object.keys(container.saves), active: container.active };
    }

    // Empty folder — seed it with the current data under a default name.
    connected = true;
    activeName = DEFAULT_SAVE_NAME;
    const res = await persistActive(handle);
    if (!res.ok) return res;
    lastErrorMsg = null;
    emitStatus();
    return { ok: true, hasExistingData: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) return { ok: false, error: "Cancelled" };
    return { ok: false, error: msg };
  }
}

/** Load a save from the folder INTO the app (replaces current app data).
 *  Without a name, loads the container's active save. This is the
 *  "overwrite current data" action. */
export async function loadActiveSave(name?: string): Promise<{ ok: boolean; error?: string }> {
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No folder connected." };
  const container = await readContainer(handle);
  if (!container || Object.keys(container.saves).length === 0) {
    return { ok: false, error: "No saves found in folder." };
  }
  const target = (name && container.saves[name])
    ? name
    : (container.active in container.saves ? container.active : Object.keys(container.saves)[0]);
  activeName = target;
  connected = true;

  // Persist the active pointer if the chosen save differs from the stored one.
  if (container.active !== target) {
    container.active = target;
    await writeFile(handle, JSON.stringify(container));
  }

  suppressSave = true;
  try {
    const res = restoreFromSyncPayload(JSON.stringify(container.saves[target]));
    if (!res.ok) {
      lastErrorMsg = `Load failed: ${res.error}`;
      emitStatus();
      return res;
    }
    emitLoaded();
  } finally {
    suppressSave = false;
  }
  lastErrorMsg = null;
  emitStatus();
  return { ok: true };
}

/** Save the current app data into the folder as a NEW named save, without
 *  disturbing existing saves. Becomes the active save. */
export async function saveCurrentAsNew(name: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a name for the save." };
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No folder connected." };
  const container = (await readContainer(handle)) ?? freshContainer();
  if (container.saves[trimmed]) {
    return { ok: false, error: `A save named "${trimmed}" already exists.` };
  }
  container.saves[trimmed] = JSON.parse(buildSyncPayload()) as SyncPayload;
  container.active = trimmed;
  container.updated = new Date().toISOString();
  activeName = trimmed;
  connected = true;
  const res = await writeFile(handle, JSON.stringify(container));
  if (res.ok) emitStatus();
  return res;
}

/** Switch the active save: load the named save into the app and make it the
 *  auto-save target. */
export async function switchSave(name: string): Promise<{ ok: boolean; error?: string }> {
  return loadActiveSave(name);
}

/** Delete a named save from the folder. If it was active, another becomes active. */
export async function deleteSave(name: string): Promise<{ ok: boolean; error?: string }> {
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No folder connected." };
  const container = await readContainer(handle);
  if (!container || !container.saves[name]) return { ok: false, error: "Save not found." };
  delete container.saves[name];
  const remaining = Object.keys(container.saves);
  if (container.active === name) container.active = remaining[0] ?? "";
  if (activeName === name) activeName = container.active || null;
  container.updated = new Date().toISOString();
  const res = await writeFile(handle, JSON.stringify(container));
  if (res.ok) emitStatus();
  return res;
}

/** After a page reload, re-request permission (user gesture required) and
 *  optionally load the active save into localStorage. */
export async function reconnectFolder(opts: { loadFromFolder: boolean } = { loadFromFolder: true }): Promise<{ ok: boolean; error?: string }> {
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No folder connected — pick one first." };
  try {
    const perm = await handle.requestPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      return { ok: false, error: "Permission denied." };
    }
    connected = true;
    lastErrorMsg = null;
    if (opts.loadFromFolder) {
      const res = await loadActiveSave();
      // An empty folder (no saves) is fine; surface only real load failures.
      if (!res.ok && res.error && !/No saves/.test(res.error)) lastErrorMsg = res.error;
    }
    emitStatus();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastErrorMsg = msg;
    emitStatus();
    return { ok: false, error: msg };
  }
}

export async function disconnectFolder(): Promise<void> {
  await idbDelete(HANDLE_KEY);
  cachedHandle = null;
  connected = false;
  activeName = null;
  lastSavedAt = null;
  lastErrorMsg = null;
  emitStatus();
}

/** Immediate write of current data to the active save; bypasses debounce. */
export async function saveNow(): Promise<{ ok: boolean; error?: string }> {
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No folder connected." };
  const perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") return { ok: false, error: "Permission lapsed — reconnect folder." };
  return persistActive(handle);
}

/** Read-modify-write: update only the active save slot, preserving the others. */
async function persistActive(handle: FSDirHandle): Promise<{ ok: boolean; error?: string }> {
  const container = (await readContainer(handle)) ?? freshContainer();
  const name = activeName ?? container.active ?? DEFAULT_SAVE_NAME;
  activeName = name;
  container.saves[name] = JSON.parse(buildSyncPayload()) as SyncPayload;
  container.active = name;
  container.updated = new Date().toISOString();
  return writeFile(handle, JSON.stringify(container));
}

async function writeFile(handle: FSDirHandle, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const file = await handle.getFileHandle(DATA_FILENAME, { create: true });
    const w = await file.createWritable();
    await w.write(text);
    await w.close();
    lastSavedAt = Date.now();
    lastErrorMsg = null;
    emitStatus();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastErrorMsg = msg;
    emitStatus();
    return { ok: false, error: msg };
  }
}

async function tryRead(handle: FSDirHandle): Promise<string | null> {
  try {
    const file = await handle.getFileHandle(DATA_FILENAME, { create: false });
    const blob = await file.getFile();
    return await blob.text();
  } catch { return null; }
}

async function readContainer(handle: FSDirHandle): Promise<SaveContainer | null> {
  const text = await tryRead(handle);
  return text ? parseContainer(text) : null;
}

function emitStatus(): void {
  try {
    window.dispatchEvent(new CustomEvent("lt-folder-sync-status"));
  } catch { /* jsdom */ }
}

// ── Auto-save on data changes ─────────────────────────────────────────

let saveTimer: number | null = null;
const DEBOUNCE_MS = 1500;

function scheduleSave(): void {
  if (!connected || suppressSave) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    saveTimer = null;
    const handle = await getHandle();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      connected = false;
      lastErrorMsg = "Permission lapsed";
      emitStatus();
      return;
    }
    await persistActive(handle);
  }, DEBOUNCE_MS);
}

// Install a localStorage.setItem interceptor once so EVERY write to an
// export key fires `lt-data-changed`. Without this, modules that bypass
// storage.ts's lsSet helper (e.g. DrumPatterns writing lt_interplay_*
// directly) wouldn't trigger the debounced folder save.
let patched = false;
function patchLocalStorage(): void {
  if (patched) return;
  patched = true;
  const proto = Storage.prototype;
  const orig = proto.setItem;
  proto.setItem = function patchedSetItem(key: string, value: string) {
    orig.call(this, key, value);
    if (this === window.localStorage && isExportKey(key)) {
      try {
        window.dispatchEvent(new CustomEvent("lt-data-changed", { detail: { key } }));
      } catch { /* jsdom / non-browser */ }
    }
  };
  const origRemove = proto.removeItem;
  proto.removeItem = function patchedRemoveItem(key: string) {
    origRemove.call(this, key);
    if (this === window.localStorage && isExportKey(key)) {
      try {
        window.dispatchEvent(new CustomEvent("lt-data-changed", { detail: { key } }));
      } catch { /* jsdom / non-browser */ }
    }
  };
}

function emitLoaded(): void {
  try {
    window.dispatchEvent(new CustomEvent("lt-folder-sync-loaded"));
  } catch { /* jsdom */ }
}

export function initFolderSync(): void {
  if (typeof window === "undefined") return;
  patchLocalStorage();
  // Flush any pending write before unload so the last-moment entry isn't lost.
  window.addEventListener("beforeunload", () => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
      // Best-effort synchronous-ish save; writable streams are async so this
      // may not complete before unload, but scheduleSave debounce is short
      // enough that most writes land before the user navigates away.
      void saveNow();
    }
  });
  window.addEventListener("lt-data-changed", scheduleSave);
  // Initial status probe — if permission is still granted from a prior session
  // (installed PWAs, or the rare case where Chrome remembers the grant),
  // auto-load the active save into localStorage so the UI starts in
  // sync with whatever was last written from any device.
  void (async () => {
    const handle = await getHandle();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      connected = true;
      await loadActiveSave();
      emitStatus();
    } else {
      emitStatus(); // notify listeners that handle exists but needs permission
    }
  })();
}
