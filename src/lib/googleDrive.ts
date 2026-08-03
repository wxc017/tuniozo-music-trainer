// Google Drive sync — client-side only, no backend needed.
// Uses appDataFolder so files are hidden from user's Drive UI.

import { dlog } from "./driveDebug";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: { access_token?: string; error?: string; scope?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

// Client IDs are not secrets (they're exposed in the frontend bundle), so a
// committed fallback lets Drive work on the deployed site without CI env vars.
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
  || "567239371423-afcld64jbh0p2j9ojs1crqdtk97ai8k3.apps.googleusercontent.com";
// appdata → the hidden music-sync file; drive.file → app-created video files
// (visible in the user's Drive, in a "Tunizo Workouts" folder).
const SCOPES = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";
const SYNC_FILENAME = "lumatone_sync.json";
const TOKEN_KEY = "lt_gdrive_token";

export function isGoogleDriveAvailable(): boolean {
  return !!CLIENT_ID;
}

// ── Persist token across page loads ─────────────────────────────────────

export function getSavedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// One Google sign-in drives BOTH data sync and workout-video offload. Any change
// to the token is broadcast so every part of the UI (Settings panel, workout-log
// Drive toggle) reflects the single shared connection — sign in once, everywhere.
export const GDRIVE_TOKEN_EVENT = "lt-gdrive-token-changed";
function emitTokenChange(): void {
  try { window.dispatchEvent(new CustomEvent(GDRIVE_TOKEN_EVENT)); } catch { /* non-browser (jsdom) */ }
}

function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  emitTokenChange();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  emitTokenChange();
}

// ── Load GSI script dynamically ─────────────────────────────────────────

let gsiLoaded = false;
function loadGsi(): Promise<void> {
  if (gsiLoaded && window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) { gsiLoaded = true; return resolve(); }
    dlog("GSI: injecting accounts.google.com/gsi/client script");
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => { gsiLoaded = true; dlog("GSI: script loaded OK"); resolve(); };
    s.onerror = () => { dlog("GSI: script FAILED to load (offline / blocked / CSP?)"); reject(new Error("Failed to load Google Identity Services")); };
    document.head.appendChild(s);
  });
}

// ── OAuth token ─────────────────────────────────────────────────────────

export async function requestAccessToken(): Promise<string> {
  if (!CLIENT_ID) { dlog("sign-in: no CLIENT_ID configured"); throw new Error("Google Drive not configured"); }
  dlog("sign-in: begin — loading GSI");
  await loadGsi();
  if (!window.google?.accounts?.oauth2) {
    dlog("sign-in: window.google.accounts.oauth2 missing after load");
    throw new Error("Google Identity Services unavailable");
  }
  dlog("sign-in: GSI ready, creating token client");
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: (v: never) => void, v: unknown) => { if (!settled) { settled = true; fn(v as never); } };

    // No error_callback / no timeout is exactly how "click does nothing" happens:
    // if the popup is blocked or dismissed the plain callback never fires and the
    // promise hangs forever. Both are wired here so failures always surface.
    const timer = setTimeout(() => {
      dlog("sign-in: TIMED OUT after 120s — popup blocked/closed, or no consent returned");
      done(reject, new Error("Sign-in timed out — the Google popup may have been blocked. Allow pop-ups and retry."));
    }, 120000);

    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        // NB: no forced `prompt: "consent"` — it regressed sign-in. GSI already
        // shows consent for any not-yet-granted scope.
        callback: (resp) => {
          clearTimeout(timer);
          if (resp.error) { dlog(`sign-in: callback error: ${resp.error}`); done(reject, new Error(resp.error)); }
          else if (resp.access_token) {
            const scopes = resp.scope ?? "(scope not reported)";
            const hasAppData = /drive\.appdata/.test(scopes);
            dlog(`sign-in: TOKEN received. granted scopes: ${scopes}`);
            dlog(hasAppData ? "sign-in: drive.appdata GRANTED ✓" : "sign-in: drive.appdata MISSING ✗ — sync will 403");
            saveToken(resp.access_token);
            done(resolve, resp.access_token);
          } else { dlog("sign-in: callback fired with NO token and no error"); done(reject, new Error("No access token received")); }
        },
        error_callback: (err) => {
          clearTimeout(timer);
          dlog(`sign-in: error_callback type="${err?.type ?? "?"}" message="${err?.message ?? ""}"`);
          done(reject, new Error(err?.type || err?.message || "sign-in failed"));
        },
      });
      dlog("sign-in: opening Google consent popup (requestAccessToken)");
      client.requestAccessToken();
    } catch (e) {
      clearTimeout(timer);
      dlog(`sign-in: exception creating/invoking client: ${e instanceof Error ? e.message : String(e)}`);
      done(reject, e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// Browser OAuth tokens expire in ~1h and the token flow has NO refresh token —
// that's why the user had to keep re-logging in. But GSI can hand back a fresh
// token silently (no popup, no user gesture) via prompt:"" as long as the Google
// session and the existing grant are still valid. We call this automatically on
// a 401, so a signed-in user stays signed in for as long as their Google session
// lasts. Concurrent callers share one in-flight refresh.
let silentRefresh: Promise<string | null> | null = null;
export function refreshTokenSilent(): Promise<string | null> {
  if (silentRefresh) return silentRefresh;
  silentRefresh = (async () => {
    try {
      await loadGsi();
      if (!window.google?.accounts?.oauth2) return null;
      return await new Promise<string | null>(resolve => {
        let settled = false;
        const finish = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
        const timer = setTimeout(() => { dlog("auth: silent refresh timed out"); finish(null); }, 10000);
        try {
          const client = window.google!.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID, scope: SCOPES, prompt: "",
            callback: (resp) => {
              clearTimeout(timer);
              if (resp.access_token) { dlog("auth: silent refresh succeeded — fresh token"); saveToken(resp.access_token); finish(resp.access_token); }
              else finish(null);
            },
            error_callback: (err) => { clearTimeout(timer); dlog(`auth: silent refresh failed (${err?.type ?? "?"}) — interactive sign-in needed`); finish(null); },
          });
          client.requestAccessToken();
        } catch (e) { clearTimeout(timer); dlog(`auth: silent refresh threw ${e instanceof Error ? e.message : String(e)}`); finish(null); }
      });
    } finally { silentRefresh = null; }
  })();
  return silentRefresh;
}

// Proactive keep-alive: while the app is open and signed in, silently renew the
// token on focus (throttled) so it's replaced BEFORE it expires — instead of
// only reacting to a 401 from a background fetch, which can't open the popup
// fallback and dies with "popup_failed_to_open". This still needs third-party
// cookies enabled (the silent renewal reads your Google session cookie); when
// they're blocked it fails quietly and an interactive sign-in is required.
let autoRefreshInit = false;
let lastRefreshAt = 0;
export function initTokenAutoRefresh(): void {
  if (autoRefreshInit || typeof document === "undefined") return;
  autoRefreshInit = true;
  const maybeRefresh = () => {
    if (document.visibilityState !== "visible" || !getSavedToken()) return;
    // Tokens last ~1h; refresh at most every ~25 min so it never lapses in use.
    const now = Date.now();
    if (now - lastRefreshAt < 25 * 60 * 1000) return;
    lastRefreshAt = now;
    void refreshTokenSilent();
  };
  document.addEventListener("visibilitychange", maybeRefresh);
  window.addEventListener("focus", maybeRefresh);
}

// ── Drive REST helpers ──────────────────────────────────────────────────

// 401 = expired/invalid token → drop it so the user re-signs and gets a fresh one.
// 403 = authenticated but not authorized (almost always the token lacks the
// drive.appdata scope). We do NOT clear the token on 403: re-signing returns the
// same scopes (GSI won't re-prompt for an existing grant), so wiping it just
// loops. The user must revoke + re-grant instead — the UI says so. We keep them
// signed in and surface a tagged message.
function throwIfAuthError(status: number): void {
  if (status === 401) { dlog("auth: HTTP 401 — token expired/invalid, clearing"); clearToken(); throw new Error("401"); }
  if (status === 403) {
    dlog("auth: HTTP 403 — insufficient permission (token likely lacks drive.appdata)");
    throw new Error("403: Google Drive access was denied. Revoke this app in your Google account, then sign in again and allow all Drive permissions.");
  }
}

// On any failing Drive response, log the JSON error body — it carries the real
// reason (e.g. "accessNotConfigured" = Drive API disabled on the project;
// "insufficientPermissions"; "rateLimitExceeded"). Cloned so callers can still
// read the original body.
async function logErrorBody(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  try {
    const txt = await res.clone().text();
    let reason = "";
    try {
      const j = JSON.parse(txt);
      reason = j?.error?.errors?.[0]?.reason || j?.error?.status || "";
    } catch { /* not JSON */ }
    dlog(`${label} HTTP ${res.status}${reason ? ` reason=${reason}` : ""} — ${txt.slice(0, 300)}`);
  } catch {
    dlog(`${label} HTTP ${res.status} (error body unreadable)`);
  }
}

// All Drive requests go through here: attaches the bearer token and, on a 401,
// silently refreshes the token once and retries before giving up. That refresh-
// and-retry is what keeps the user from having to sign in again every hour.
async function driveFetch(url: string, init: RequestInit, token: string, retried = false): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) {
    dlog("auth: HTTP 401 — attempting silent token refresh + retry");
    const fresh = await refreshTokenSilent();
    if (fresh) return driveFetch(url, init, fresh, true);
  }
  await logErrorBody(res, init.method ?? "GET");
  throwIfAuthError(res.status);
  return res;
}

async function driveGet(token: string, url: string): Promise<Response> {
  return driveFetch(url, {}, token);
}

async function findSyncFile(token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${SYNC_FILENAME}'&fields=files(id,modifiedTime)&pageSize=1`;
  const res = await driveGet(token, url);
  dlog(`list appDataFolder → HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = await res.json();
  const found = data.files?.[0] ?? null;
  dlog(found ? `list: sync file found (id ${String(found.id).slice(0, 8)}…)` : "list: no sync file yet");
  return found;
}

export async function getSyncInfo(token: string): Promise<{ modifiedTime: string } | null> {
  const file = await findSyncFile(token);
  return file ? { modifiedTime: file.modifiedTime } : null;
}

export async function uploadSync(token: string, payload: string): Promise<void> {
  dlog(`upload: payload ${payload.length} bytes`);
  const existing = await findSyncFile(token);

  if (existing) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: payload },
      token,
    );
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    dlog(`upload: PATCH existing file OK (${res.status})`);
  } else {
    const metadata = JSON.stringify({ name: SYNC_FILENAME, parents: ["appDataFolder"] });
    const boundary = "----lumatone_sync";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${payload}\r\n` +
      `--${boundary}--`;
    const res = await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
      token,
    );
    if (!res.ok) throw new Error(`Create failed: ${res.status}`);
    dlog(`upload: created new file OK (${res.status})`);
  }
}

export async function downloadSync(token: string): Promise<string | null> {
  const existing = await findSyncFile(token);
  if (!existing) return null;
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const text = await res.text();
  dlog(`download: ${text.length} bytes`);
  return text;
}

// ── Generic file ops (drive.file scope) — used for workout videos ─────────

/** Upload a binary blob as a new Drive file; returns the new file id. */
export async function uploadDriveFile(
  token: string, meta: { name: string; mimeType: string; parents?: string[] }, blob: Blob,
): Promise<string> {
  const boundary = "----tunizo" + Math.random().toString(36).slice(2);
  const metaJson = JSON.stringify({ name: meta.name, mimeType: meta.mimeType, ...(meta.parents ? { parents: meta.parents } : {}) });
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = new Blob([pre, blob, post], { type: `multipart/related; boundary=${boundary}` });
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", body }, token);
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  return (await res.json()).id as string;
}

export async function getDriveFileBlob(token: string, id: string): Promise<Blob> {
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.blob();
}

export async function deleteDriveFile(token: string, id: string): Promise<void> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" }, token);
  if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
}

/** Find a file by exact name inside a folder (newest first); null if none. */
export async function findFileInFolder(
  token: string, folderId: string, name: string,
): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`);
  if (!res.ok) throw new Error(`Find file failed: ${res.status}`);
  const d = await res.json();
  return d.files?.[0] ?? null;
}

/** Every file in a folder whose name starts with `prefix`, OLDEST FIRST.
 *  Ordered by createdTime so a rotating backup set reads chronologically —
 *  the name is only a tiebreaker, since Drive allows duplicate names. */
export async function listFilesInFolder(
  token: string, folderId: string, prefix: string,
): Promise<{ id: string; name: string; createdTime: string; modifiedTime: string; size: number }[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,createdTime,modifiedTime,size)");
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime&pageSize=100`);
  if (!res.ok) throw new Error(`List files failed: ${res.status}`);
  const d = await res.json();
  const files: any[] = d.files ?? [];
  return files
    .filter(f => typeof f.name === "string" && f.name.startsWith(prefix))
    .map(f => ({
      id: f.id as string, name: f.name as string,
      createdTime: (f.createdTime ?? f.modifiedTime ?? "") as string,
      modifiedTime: (f.modifiedTime ?? f.createdTime ?? "") as string,
      size: Number(f.size ?? 0),
    }))
    .sort((a, b) => (a.createdTime.localeCompare(b.createdTime)) || a.name.localeCompare(b.name));
}

/** Replace an existing Drive file's contents (media PATCH). */
export async function updateDriveFileMedia(token: string, id: string, blob: Blob): Promise<void> {
  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: "PATCH", body: blob }, token);
  if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
}

/** Find (or create) a folder by name in the user's Drive; returns its id. */
export async function findOrCreateFolder(token: string, name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  if (res.ok) {
    const d = await res.json();
    if (d.files?.[0]) return d.files[0].id as string;
  }
  const res2 = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  }, token);
  if (!res2.ok) throw new Error(`Folder create failed: ${res2.status}`);
  return (await res2.json()).id as string;
}
