// Google Drive sync — client-side only, no backend needed.
// Uses appDataFolder so files are hidden from user's Drive UI.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
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

function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Load GSI script dynamically ─────────────────────────────────────────

let gsiLoaded = false;
function loadGsi(): Promise<void> {
  if (gsiLoaded && window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) { gsiLoaded = true; return resolve(); }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => { gsiLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

// ── OAuth token ─────────────────────────────────────────────────────────

export async function requestAccessToken(): Promise<string> {
  if (!CLIENT_ID) throw new Error("Google Drive not configured");
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) reject(new Error(resp.error));
        else if (resp.access_token) {
          saveToken(resp.access_token);
          resolve(resp.access_token);
        } else reject(new Error("No access token received"));
      },
    });
    client.requestAccessToken();
  });
}

// ── Drive REST helpers ──────────────────────────────────────────────────

async function driveGet(token: string, url: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { clearToken(); throw new Error("401"); }
  return res;
}

async function findSyncFile(token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${SYNC_FILENAME}'&fields=files(id,modifiedTime)&pageSize=1`;
  const res = await driveGet(token, url);
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = await res.json();
  return data.files?.[0] ?? null;
}

export async function getSyncInfo(token: string): Promise<{ modifiedTime: string } | null> {
  const file = await findSyncFile(token);
  return file ? { modifiedTime: file.modifiedTime } : null;
}

export async function uploadSync(token: string, payload: string): Promise<void> {
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
    if (res.status === 401) { clearToken(); throw new Error("401"); }
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
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
    if (res.status === 401) { clearToken(); throw new Error("401"); }
    if (!res.ok) throw new Error(`Create failed: ${res.status}`);
  }
}

export async function downloadSync(token: string): Promise<string | null> {
  const existing = await findSyncFile(token);
  if (!existing) return null;
  const res = await driveGet(token, `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
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
  if (res.status === 401) { clearToken(); throw new Error("401"); }
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
  if (res.status === 401) { clearToken(); throw new Error("401"); }
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
  if (res2.status === 401) { clearToken(); throw new Error("401"); }
  if (!res2.ok) throw new Error(`Folder create failed: ${res2.status}`);
  return (await res2.json()).id as string;
}
