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

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
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
