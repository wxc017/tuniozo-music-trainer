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

async function driveGet(token: string, url: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  await logErrorBody(res, "GET");
  throwIfAuthError(res.status);
  return res;
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
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: payload,
      },
    );
    await logErrorBody(res, "upload PATCH");
    throwIfAuthError(res.status);
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    dlog(`upload: PATCH existing file OK (${res.status})`);
  } else {
    const metadata = JSON.stringify({ name: SYNC_FILENAME, parents: ["appDataFolder"] });
    const boundary = "----lumatone_sync";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${payload}\r\n` +
      `--${boundary}--`;
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    await logErrorBody(res, "upload create");
    throwIfAuthError(res.status);
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
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body,
  });
  throwIfAuthError(res.status);
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  return (await res.json()).id as string;
}

export async function getDriveFileBlob(token: string, id: string): Promise<Blob> {
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.blob();
}

export async function deleteDriveFile(token: string, id: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  throwIfAuthError(res.status);
  if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
}

/** Find (or create) a folder by name in the user's Drive; returns its id. */
export async function findOrCreateFolder(token: string, name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  if (res.ok) {
    const d = await res.json();
    if (d.files?.[0]) return d.files[0].id as string;
  }
  const res2 = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  throwIfAuthError(res2.status);
  if (!res2.ok) throw new Error(`Folder create failed: ${res2.status}`);
  return (await res2.json()).id as string;
}
