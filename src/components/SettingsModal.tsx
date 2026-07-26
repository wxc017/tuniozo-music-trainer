import { useRef, useState, useEffect } from "react";
import { exportMusicData, importMusicData, getMusicDataSummary, exportAcademicData, importAcademicData, getAcademicDataSummary } from "@/lib/storage";
import { isGoogleDriveAvailable, requestAccessToken, uploadSync, downloadSync, getSyncInfo, getSavedToken, clearToken, GDRIVE_TOKEN_EVENT } from "@/lib/googleDrive";
import { buildSyncPayload } from "@/lib/syncData";
import { recordSynced } from "@/lib/syncMarker";
import { computeSyncDiff, applySyncSelection, autoMergeAdditive, type SyncDiff } from "@/lib/syncMerge";
import SyncMergeDialog from "./SyncMergeDialog";
import { getDriveLog, subscribeDriveLog, clearDriveLog, dlog } from "@/lib/driveDebug";
import {
  isSupported as isFolderSyncSupported,
  getStatus as getFolderSyncStatus,
  connectFolder,
  reconnectFolder,
  disconnectFolder,
  saveNow as folderSyncSaveNow,
  loadActiveSave,
  saveCurrentAsNew,
  switchSave,
  deleteSave,
  type SyncStatus,
} from "@/lib/folderSync";

interface Props {
  onClose: () => void;
  onDataImported: () => void;
  betaPlayRotation: boolean;
  onBetaPlayRotationChange: (v: boolean) => void;
  betaIntervalChain: boolean;
  onBetaIntervalChainChange: (v: boolean) => void;
  betaComma: boolean;
  onBetaCommaChange: (v: boolean) => void;
  betaTransform: boolean;
  onBetaTransformChange: (v: boolean) => void;
  betaMathLab: boolean;
  onBetaMathLabChange: (v: boolean) => void;
  betaChordDrone: boolean;
  onBetaChordDroneChange: (v: boolean) => void;
  betaMode: boolean;
  onBetaModeChange: (v: boolean) => void;
  academicMode: boolean;
  academicAvailable?: boolean;
  onAcademicModeChange: (v: boolean) => void;
}

export default function SettingsModal({ onClose, onDataImported, betaPlayRotation, onBetaPlayRotationChange, betaIntervalChain, onBetaIntervalChainChange, betaComma, onBetaCommaChange, betaTransform, onBetaTransformChange, betaMathLab, onBetaMathLabChange, betaChordDrone, onBetaChordDroneChange, betaMode, onBetaModeChange, academicMode, academicAvailable = false, onAcademicModeChange }: Props) {
  const importRef = useRef<HTMLInputElement>(null);
  const musicImportRef = useRef<HTMLInputElement>(null);
  const academicImportRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [musicSummary] = useState(() => getMusicDataSummary());
  const [academicSummary] = useState(() => getAcademicDataSummary());

  // Google Drive sync state
  const [gdriveToken, setGdriveToken] = useState<string | null>(() => getSavedToken());
  const [gdriveStatus, setGdriveStatus] = useState<"idle" | "busy">("idle");
  const [gdriveSyncTime, setGdriveSyncTime] = useState<string | null>(null);
  const [driveLog, setDriveLog] = useState<string[]>(() => getDriveLog());
  const [showDriveLog, setShowDriveLog] = useState(true);
  // Pending "Load from Drive" merge awaiting user review.
  const [mergeState, setMergeState] = useState<{ data: string; diff: SyncDiff; modifiedTime: string | null } | null>(null);
  useEffect(() => subscribeDriveLog(setDriveLog), []);
  // Reflect a connection made/broken elsewhere (e.g. the workout-log Drive
  // toggle) so this panel shows the one shared Google sign-in.
  useEffect(() => {
    const sync = () => setGdriveToken(getSavedToken());
    window.addEventListener(GDRIVE_TOKEN_EVENT, sync);
    return () => window.removeEventListener(GDRIVE_TOKEN_EVENT, sync);
  }, []);

  // Folder sync state
  const [folderStatus, setFolderStatus] = useState<SyncStatus>({ state: "disconnected" });
  const [folderBusy, setFolderBusy] = useState(false);
  // Shown after connecting to a folder that already contains saves: the user
  // chooses to overwrite current data or save it under a new name.
  const [pendingChoice, setPendingChoice] = useState<{ saves: string[]; active: string } | null>(null);
  const [choiceNewOpen, setChoiceNewOpen] = useState(false); // name input in the connect prompt
  const [panelNewOpen, setPanelNewOpen] = useState(false);   // name input in the connected panel
  const [newSaveName, setNewSaveName] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () => getFolderSyncStatus().then(s => { if (alive) setFolderStatus(s); });
    refresh();
    window.addEventListener("lt-folder-sync-status", refresh);
    return () => { alive = false; window.removeEventListener("lt-folder-sync-status", refresh); };
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };

  // Record a COMPLETED sync (push or pull): update UI state and the persistent
  // baseline (Drive modifiedTime + local content signature) so App.tsx's
  // auto-pull knows this device is in sync as of now. Use this only after data
  // actually moved — not for the passive mount fetch below.
  const rememberSync = (modifiedTime: string | null) => {
    setGdriveSyncTime(modifiedTime);
    if (modifiedTime) recordSynced(modifiedTime);
  };

  // 401 = expired → drop the token so the UI returns to "Sign in" for a fresh one.
  // 403 = missing permission → keep the user signed in (re-signing wouldn't help)
  // and tell them to revoke + re-grant. Returns true if the error was handled.
  const handleAuthError = (err: unknown): boolean => {
    const m = err instanceof Error ? err.message : "";
    if (m.includes("401")) {
      setGdriveToken(null); clearToken();
      flash("Session expired — sign in again");
      return true;
    }
    if (m.includes("403")) {
      flash("Google Drive denied access. Revoke this app at myaccount.google.com/permissions, then sign in again and allow all Drive permissions.");
      return true;
    }
    return false;
  };

  // Fetch last sync time on mount if logged in (display only — does NOT set the
  // sync baseline, since we don't know that local matches Drive here).
  useEffect(() => {
    if (!gdriveToken) return;
    getSyncInfo(gdriveToken).then(info => {
      setGdriveSyncTime(info?.modifiedTime ?? null);
    }).catch(err => {
      // Only expiry (401) ends the session. A 403 (missing permission) must NOT
      // wipe the token — that hides the Save/Load buttons and strands the user;
      // they stay signed in and can retry / re-grant.
      if (err instanceof Error && err.message.includes("401")) {
        setGdriveToken(null); clearToken();
      }
    });
  }, [gdriveToken]);

  const handleGoogleSignIn = async () => {
    dlog("UI: 'Sign in with Google' clicked");
    try {
      setGdriveStatus("busy");
      flash("Signing in…");
      const token = await requestAccessToken();
      setGdriveToken(token);
      // Sync immediately after sign-in
      try {
        const data = await downloadSync(token);
        if (data) {
          // Additive merge, not overwrite: bring over Drive items this device
          // doesn't have, but keep anything local. Use "Load from Drive" for a
          // full reviewed merge (changes / deletions).
          const added = autoMergeAdditive(data);
          onDataImported();
          flash(added > 0 ? `Signed in — merged ${added} item${added === 1 ? "" : "s"} from Drive` : "Signed in and synced!");
        } else {
          // No file yet — upload current data
          await uploadSync(token, buildSyncPayload());
          flash("Signed in — data saved to Drive");
        }
        const info = await getSyncInfo(token);
        rememberSync(info?.modifiedTime ?? null);
      } catch { flash("Signed in"); }
    } catch (err) {
      flash(`Sign-in failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setGdriveStatus("idle");
    }
  };

  const handleGdriveSave = async () => {
    if (!gdriveToken) return;
    try {
      setGdriveStatus("busy");
      flash("Saving to Google Drive…");
      const payload = buildSyncPayload();
      await uploadSync(gdriveToken, payload);
      const info = await getSyncInfo(gdriveToken);
      rememberSync(info?.modifiedTime ?? null);
      flash("Saved to Google Drive!");
    } catch (err) {
      if (!handleAuthError(err)) flash(`Save failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setGdriveStatus("idle");
    }
  };

  // Pull from Drive and open a review dialog showing exactly what would be added,
  // changed, or deleted — so loading a device with fewer items never silently
  // wipes local-only data. Nothing is written until the user hits Apply.
  const handleGdriveLoad = async () => {
    if (!gdriveToken) return;
    try {
      setGdriveStatus("busy");
      flash("Loading from Google Drive…");
      const data = await downloadSync(gdriveToken);
      if (!data) { flash("No data on Drive yet — Save first on another device"); return; }
      const diff = computeSyncDiff(data);
      const info = await getSyncInfo(gdriveToken);
      if (!diff.items.length && !diff.values.length) {
        rememberSync(info?.modifiedTime ?? null); // already in sync; update baseline
        flash("Already up to date with Drive");
        return;
      }
      setMergeState({ data, diff, modifiedTime: info?.modifiedTime ?? null });
    } catch (err) {
      if (!handleAuthError(err)) flash(`Load failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setGdriveStatus("idle");
    }
  };

  const applyMerge = (applied: Set<string>) => {
    if (!mergeState) return;
    applySyncSelection(mergeState.data, mergeState.diff, applied);
    if (mergeState.modifiedTime) recordSynced(mergeState.modifiedTime);
    flash("Merged — reloading…");
    setTimeout(() => window.location.reload(), 500);
  };

  const handleGdriveSignOut = () => {
    setGdriveToken(null);
    clearToken();
    setGdriveSyncTime(null);
    flash("Signed out of Google Drive");
  };

  const handleMusicExport = async () => {
    flash("Exporting…");
    await exportMusicData();
    flash("Saved data exported!");
  };

  const handleMusicImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const buf = ev.target?.result as ArrayBuffer | string;
      const result = await importMusicData(buf);
      if (result.ok) {
        onDataImported();
        flash("Saved data imported! Reloading…");
        setTimeout(() => window.location.reload(), 800);
      } else {
        flash(result.error ?? "Import failed");
      }
    };
    // Read as ArrayBuffer so gzip-compressed files can be decompressed binary
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleFolderConnect = async () => {
    setFolderBusy(true);
    flash("Pick a folder…");
    const res = await connectFolder();
    setFolderBusy(false);
    if (!res.ok) {
      flash(res.error ?? "Failed to connect folder");
      return;
    }
    if (res.hasExistingData) {
      // Folder already has saves — ask before touching the current app data.
      setChoiceNewOpen(false);
      setNewSaveName("");
      setPendingChoice({ saves: res.saves ?? [], active: res.active ?? "" });
      flash("This folder already has saved data");
    } else {
      flash("Folder connected — data will auto-save");
      onDataImported();
    }
  };

  // "Overwrite current data" — load the folder's active save into the app.
  const handleLoadFolderData = async () => {
    setFolderBusy(true);
    flash("Loading folder data…");
    const res = await loadActiveSave();
    setFolderBusy(false);
    if (res.ok) {
      setPendingChoice(null);
      flash("Loaded — reloading…");
      setTimeout(() => window.location.reload(), 800);
    } else {
      flash(res.error ?? "Load failed");
    }
  };

  // "Save under a different name" — add current data as a new named save.
  const handleSaveAsNew = async (name: string) => {
    setFolderBusy(true);
    const res = await saveCurrentAsNew(name);
    setFolderBusy(false);
    if (res.ok) {
      setPendingChoice(null);
      setChoiceNewOpen(false);
      setPanelNewOpen(false);
      setNewSaveName("");
      flash(`Saved as "${name.trim()}" — now auto-saving here`);
      onDataImported();
    } else {
      flash(res.error ?? "Save failed");
    }
  };

  // Load a different existing save (from the connected-panel list).
  const handleSwitchSave = async (name: string) => {
    if (name === folderStatus.activeSave) return;
    setFolderBusy(true);
    flash(`Loading "${name}"…`);
    const res = await switchSave(name);
    setFolderBusy(false);
    if (res.ok) {
      flash(`Loaded "${name}" — reloading…`);
      setTimeout(() => window.location.reload(), 800);
    } else {
      flash(res.error ?? "Could not switch save");
    }
  };

  const handleDeleteSave = async (name: string) => {
    const res = await deleteSave(name);
    flash(res.ok ? `Deleted "${name}"` : (res.error ?? "Delete failed"));
  };

  const handleFolderReconnect = async () => {
    setFolderBusy(true);
    flash("Reconnecting…");
    const res = await reconnectFolder({ loadFromFolder: true });
    setFolderBusy(false);
    if (res.ok) {
      flash("Folder reconnected — loaded latest data");
      onDataImported();
    } else {
      flash(res.error ?? "Reconnect failed");
    }
  };

  const handleFolderSaveNow = async () => {
    setFolderBusy(true);
    flash("Saving…");
    const res = await folderSyncSaveNow();
    setFolderBusy(false);
    flash(res.ok ? "Saved to folder" : (res.error ?? "Save failed"));
  };

  const handleFolderDisconnect = async () => {
    await disconnectFolder();
    setPendingChoice(null);
    setPanelNewOpen(false);
    setChoiceNewOpen(false);
    setNewSaveName("");
    flash("Folder disconnected");
  };

  const handleAcademicExport = async () => {
    flash("Exporting academic data…");
    await exportAcademicData();
    flash("Academic data exported!");
  };

  const handleAcademicImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      flash("Importing academic data…");
      const result = await importAcademicData(text);
      if (result.ok) {
        onDataImported();
        flash("Academic data imported! Reloading…");
        setTimeout(() => window.location.reload(), 800);
      } else {
        flash(result.error ?? "Import failed");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e]">
          <h2 className="font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className="text-[#555] hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-6 overflow-y-auto">

          {/* Beta toggle — exposes experimental sections in the top button bar. */}
          <div>
            <h3 className="text-xs font-semibold text-[#c8a860] uppercase tracking-widest mb-3">Beta</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={betaMode}
                  onChange={e => onBetaModeChange(e.target.checked)}
                  className="accent-[#c8a860] w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-[#ccc]">Beta</div>
                  <div className="text-xs text-[#555]">Show experimental sections: Vocal Percussion, Mixed Groups, Drill &amp; Response, Uncommon Meters, Solkattu, Quick Transcriptions, Phrase Decomposition, Interval Browser, Microwave, Temperament Explorer</div>
                </div>
              </label>
              <label className="flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={betaChordDrone}
                  onChange={e => onBetaChordDroneChange(e.target.checked)}
                  className="accent-[#c8a860] w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-[#ccc]">Chord Drone tab</div>
                  <div className="text-xs text-[#555]">Show the Chord Drone tab in Tonal Audiation.  Hidden by default since the drone exercise is still being reworked around tuning lineages.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Mode section (only if academic components are present locally) */}
          {academicAvailable && (
            <div>
              <h3 className="text-xs font-semibold text-[#8b5cf6] uppercase tracking-widest mb-3">Mode</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={academicMode}
                    onChange={e => onAcademicModeChange(e.target.checked)}
                    className="accent-[#8b5cf6] w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#ccc]">Academic Toggle</div>
                    <div className="text-xs text-[#555]">Hide music modes and show academic tools (Reading Workflow)</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Local Folder Sync section */}
          {isFolderSyncSupported() && (
            <div>
              <h3 className="text-xs font-semibold text-[#5a8a5a] uppercase tracking-widest mb-3">Local Folder Sync</h3>
              <div className="space-y-2">
                {pendingChoice ? (
                  <>
                    <div className="px-3 py-2 bg-[#2a1a0a] border border-[#5a3a1a] rounded-lg text-xs text-[#d89a4a]">
                      This folder already has saved data
                      {pendingChoice.saves.length > 0 && (
                        <> ({pendingChoice.saves.length} save{pendingChoice.saves.length === 1 ? "" : "s"}: <span className="text-[#ffcf88]">{pendingChoice.saves.join(", ")}</span>)</>
                      )}. Load it over what's currently in the app, or keep your current data and store it here under a new name.
                    </div>
                    <button
                      onClick={handleLoadFolderData}
                      disabled={folderBusy}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#5a8a5a] hover:border-[#7aaa7a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-base">↑</span>
                      <div>
                        <div className="font-medium">Load the folder's saved data</div>
                        <div className="text-xs text-[#555]">Replaces what's currently in the app{pendingChoice.active ? ` (loads "${pendingChoice.active}")` : ""}</div>
                      </div>
                    </button>
                    {!choiceNewOpen ? (
                      <button
                        onClick={() => { setChoiceNewOpen(true); setNewSaveName(""); }}
                        disabled={folderBusy}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                      >
                        <span className="text-base">＋</span>
                        <div>
                          <div className="font-medium">Save my current data as a new name…</div>
                          <div className="text-xs text-[#555]">Keeps the existing saves; adds yours alongside</div>
                        </div>
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={newSaveName}
                          onChange={e => setNewSaveName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && newSaveName.trim()) handleSaveAsNew(newSaveName); }}
                          placeholder="Save name…"
                          className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#5a8a5a] rounded-lg text-sm text-[#ccc] outline-none"
                        />
                        <button
                          onClick={() => handleSaveAsNew(newSaveName)}
                          disabled={folderBusy || !newSaveName.trim()}
                          className="px-3 py-2 bg-[#1a2a1a] border border-[#2a4a2a] hover:border-[#5a8a5a] rounded-lg text-sm text-[#9ac99a] disabled:opacity-40"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                {folderStatus.state === "disconnected" && (
                  <button
                    onClick={handleFolderConnect}
                    disabled={folderBusy}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#5a8a5a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                  >
                    <span className="text-base">📁</span>
                    <div>
                      <div className="font-medium">Connect a folder on your computer</div>
                      <div className="text-xs text-[#555]">Auto-saves all your data to a local file. One folder can hold multiple named saves.</div>
                    </div>
                  </button>
                )}
                {folderStatus.state === "needs-permission" && (
                  <>
                    <div className="px-3 py-2 bg-[#2a1a0a] border border-[#5a3a1a] rounded-lg text-xs text-[#d89a4a]">
                      Folder <span className="text-[#ffcf88]">{folderStatus.folderName}</span> needs permission after this reload.
                    </div>
                    <button
                      onClick={handleFolderReconnect}
                      disabled={folderBusy}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#5a8a5a] hover:border-[#7aaa7a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-base">🔓</span>
                      <div>
                        <div className="font-medium">Reconnect folder &amp; load latest</div>
                        <div className="text-xs text-[#555]">One click per session (browser security requirement)</div>
                      </div>
                    </button>
                    <button
                      onClick={handleFolderDisconnect}
                      className="w-full px-3 py-1.5 text-xs text-[#555] hover:text-[#999] transition-colors text-left"
                    >
                      Forget this folder
                    </button>
                  </>
                )}
                {folderStatus.state === "connected" && (
                  <>
                    <div className="px-3 py-2 bg-[#1a1a1a] border border-[#2a4a2a] rounded-lg">
                      <div className="text-xs text-[#666]">
                        Connected: <span className="text-[#ccc]">{folderStatus.folderName}</span>
                      </div>
                      {folderStatus.activeSave && (
                        <div className="text-xs text-[#666] mt-1">
                          Active save: <span className="text-[#9ac99a]">{folderStatus.activeSave}</span>
                        </div>
                      )}
                      <div className="text-xs text-[#555] mt-1">
                        {folderStatus.lastSaved
                          ? <>Last saved: <span className="text-[#aaa]">{new Date(folderStatus.lastSaved).toLocaleTimeString()}</span></>
                          : <span>No saves yet this session</span>}
                      </div>
                      {folderStatus.lastError && (
                        <div className="text-xs text-[#d87070] mt-1">Last error: {folderStatus.lastError}</div>
                      )}
                    </div>
                    {folderStatus.saves && folderStatus.saves.length > 0 && (
                      <div className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg space-y-0.5">
                        <div className="text-[10px] uppercase tracking-widest text-[#555] mb-1">Saves in this folder</div>
                        {folderStatus.saves.map(name => {
                          const active = name === folderStatus.activeSave;
                          return (
                            <div key={name} className="flex items-center gap-2">
                              <button
                                onClick={() => handleSwitchSave(name)}
                                disabled={folderBusy}
                                className={`flex-1 text-left text-sm px-2 py-1 rounded transition-colors disabled:opacity-50 ${active ? "text-[#9ac99a]" : "text-[#bbb] hover:text-white hover:bg-[#222]"}`}
                              >
                                {active ? "● " : "○ "}{name}
                              </button>
                              {!active && (
                                <button
                                  onClick={() => handleDeleteSave(name)}
                                  title={`Delete "${name}"`}
                                  className="text-[#555] hover:text-[#d87070] text-xs px-1"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!panelNewOpen ? (
                      <button
                        onClick={() => { setPanelNewOpen(true); setNewSaveName(""); }}
                        disabled={folderBusy}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                      >
                        <span className="text-base">＋</span>
                        <div>
                          <div className="font-medium">New save…</div>
                          <div className="text-xs text-[#555]">Store the current data under a new name in this folder</div>
                        </div>
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={newSaveName}
                          onChange={e => setNewSaveName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && newSaveName.trim()) handleSaveAsNew(newSaveName); }}
                          placeholder="Save name…"
                          className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#5a8a5a] rounded-lg text-sm text-[#ccc] outline-none"
                        />
                        <button
                          onClick={() => handleSaveAsNew(newSaveName)}
                          disabled={folderBusy || !newSaveName.trim()}
                          className="px-3 py-2 bg-[#1a2a1a] border border-[#2a4a2a] hover:border-[#5a8a5a] rounded-lg text-sm text-[#9ac99a] disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setPanelNewOpen(false); setNewSaveName(""); }}
                          className="px-2 text-[#555] hover:text-[#999] text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <button
                      onClick={handleFolderSaveNow}
                      disabled={folderBusy}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-base">↓</span>
                      <div>
                        <div className="font-medium">Save now</div>
                        <div className="text-xs text-[#555]">Force an immediate write to the active save</div>
                      </div>
                    </button>
                    <button
                      onClick={handleFolderDisconnect}
                      className="w-full px-3 py-1.5 text-xs text-[#555] hover:text-[#999] transition-colors text-left"
                    >
                      Disconnect folder
                    </button>
                  </>
                )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Google Drive Sync section */}
          {isGoogleDriveAvailable() && (
            <div>
              <h3 className="text-xs font-semibold text-[#4285f4] uppercase tracking-widest mb-3">Google Drive Sync</h3>
              <div className="space-y-2">
                {!gdriveToken ? (
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={gdriveStatus === "busy"}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#4285f4] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                  >
                    <span className="text-base">G</span>
                    <div>
                      <div className="font-medium">Sign in with Google</div>
                      <div className="text-xs text-[#555]">Sync all data across devices via Google Drive</div>
                    </div>
                  </button>
                ) : (
                  <>
                    <div className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-[#666]">
                          {gdriveStatus === "busy" ? (
                            <span className="text-[#4285f4]">Syncing…</span>
                          ) : gdriveSyncTime ? (
                            <>Last synced: <span className="text-[#ccc]">{new Date(gdriveSyncTime).toLocaleString()}</span></>
                          ) : (
                            <span className="text-[#555]">No sync file on Drive yet</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleGdriveSave}
                      disabled={gdriveStatus === "busy"}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-base">↑</span>
                      <div>
                        <div className="font-medium">Save to Drive</div>
                        <div className="text-xs text-[#555]">Upload current data to Google Drive</div>
                      </div>
                    </button>
                    <button
                      onClick={handleGdriveLoad}
                      disabled={gdriveStatus === "busy"}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-base">↓</span>
                      <div>
                        <div className="font-medium">Load from Drive</div>
                        <div className="text-xs text-[#555]">Pull the latest data saved from another device (overwrites local)</div>
                      </div>
                    </button>
                    <button
                      onClick={handleGdriveSignOut}
                      className="w-full px-3 py-1.5 text-xs text-[#555] hover:text-[#999] transition-colors text-left"
                    >
                      Sign out
                    </button>
                  </>
                )}
              </div>

              {/* Debug log — diagnoses sign-in / sync issues on devices with no
                  reachable browser console (e.g. a phone). */}
              <div className="mt-3 pt-2 border-t border-[#1a1a1a]">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowDriveLog(s => !s)}
                    className="text-[10px] uppercase tracking-widest text-[#555] hover:text-[#888]"
                  >
                    {showDriveLog ? "▾" : "▸"} Debug log ({driveLog.length})
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(driveLog.join("\n")); flash("Log copied to clipboard"); }
                        catch { flash("Copy failed — select the text manually"); }
                      }}
                      className="text-[10px] text-[#4285f4] hover:underline"
                    >
                      Copy
                    </button>
                    <button onClick={() => clearDriveLog()} className="text-[10px] text-[#555] hover:text-[#888]">Clear</button>
                  </div>
                </div>
                {showDriveLog && (
                  <pre className="mt-2 text-[10px] leading-relaxed text-[#8aa88a] bg-black/50 border border-[#222] rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap select-text">
                    {driveLog.length ? driveLog.join("\n") : "No log yet — tap Sign in with Google and watch here."}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Saved Data section */}
          <div>
            <h3 className="text-xs font-semibold text-[#e87010] uppercase tracking-widest mb-3">Saved Data</h3>
            <div className="space-y-2">
              <div className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[#666]">
                  {musicSummary.transcriptions > 0 && <><span>Transcriptions</span><span className="text-[#ccc] text-right">{musicSummary.transcriptions}</span></>}
                  {musicSummary.chordCharts > 0 && <><span>Chord Charts</span><span className="text-[#ccc] text-right">{musicSummary.chordCharts}</span></>}
                  {musicSummary.practiceEntries > 0 && <><span>Practice Log</span><span className="text-[#ccc] text-right">{musicSummary.practiceEntries} days</span></>}
                  {musicSummary.drumExercises > 0 && <><span>Drum Exercises</span><span className="text-[#ccc] text-right">{musicSummary.drumExercises}</span></>}
                  {musicSummary.accentExercises > 0 && <><span>Accent Exercises</span><span className="text-[#ccc] text-right">{musicSummary.accentExercises}</span></>}
                  {musicSummary.transcriptions + musicSummary.chordCharts + musicSummary.practiceEntries + musicSummary.drumExercises + musicSummary.accentExercises === 0 && (
                    <span className="col-span-2 text-[#444]">No music data saved yet</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleMusicExport}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left"
              >
                <span className="text-base">↓</span>
                <div>
                  <div className="font-medium">Export All Data</div>
                  <div className="text-xs text-[#555]">Saved data: transcriptions, chord charts, practice log, exercises</div>
                </div>
              </button>
              <button
                onClick={() => musicImportRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left"
              >
                <span className="text-base">↑</span>
                <div>
                  <div className="font-medium">Import All Data</div>
                  <div className="text-xs text-[#555]">Restore saved data from a backup file</div>
                </div>
              </button>
              <input ref={musicImportRef} type="file" accept=".json,.gz,.json.gz" onChange={handleMusicImportFile} className="hidden" />
            </div>
          </div>

          {/* Academic Data section — only if academic components are present locally */}
          {academicAvailable && (<div>
            <h3 className="text-xs font-semibold text-[#8b5cf6] uppercase tracking-widest mb-3">Academic Data</h3>
            <div className="space-y-2">
              <div className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[#666]">
                  {academicSummary.files > 0 && <><span>Reading Files</span><span className="text-[#ccc] text-right">{academicSummary.files}</span></>}
                  {academicSummary.extracts > 0 && <><span>Text Extracts</span><span className="text-[#ccc] text-right">{academicSummary.extracts}</span></>}
                  {academicSummary.notes > 0 && <><span>Notes</span><span className="text-[#ccc] text-right">{academicSummary.notes}</span></>}
                  {academicSummary.questions > 0 && <><span>Questions</span><span className="text-[#ccc] text-right">{academicSummary.questions}</span></>}
                  {academicSummary.bookmarks > 0 && <><span>Bookmarks</span><span className="text-[#ccc] text-right">{academicSummary.bookmarks}</span></>}
                  {academicSummary.files === 0 && (
                    <span className="col-span-2 text-[#444]">No reading files saved yet</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleAcademicExport}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left"
              >
                <span className="text-base">↓</span>
                <div>
                  <div className="font-medium">Export Academic Data</div>
                  <div className="text-xs text-[#555]">Reading files, extracts, notes, questions, and PDFs</div>
                </div>
              </button>
              <button
                onClick={() => academicImportRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg text-sm text-[#ccc] hover:text-white transition-colors text-left"
              >
                <span className="text-base">↑</span>
                <div>
                  <div className="font-medium">Import Academic Data</div>
                  <div className="text-xs text-[#555]">Restore reading files and PDFs from backup</div>
                </div>
              </button>
              <input ref={academicImportRef} type="file" accept=".json" onChange={handleAcademicImportFile} className="hidden" />
            </div>
          </div>)}

          {msg && <p className="text-xs text-[#7173e6]">{msg}</p>}

          {/* Sample-credit attribution.  Two of the drone samples are
              CC-BY 4.0 (require credit); the rest are CC0 (no
              attribution required) but listed for transparency. */}
          <div className="border-t border-[#1e1e1e] pt-3 mt-2">
            <div className="text-[10px] text-[#666] uppercase tracking-widest mb-2">Drone Sample Credits</div>
            <ul className="text-[10px] text-[#666] space-y-0.5 leading-snug">
              <li><span className="text-[#888]">Cello</span> — open-string G2 by <a href="https://freesound.org/people/xserra/sounds/77764/" target="_blank" rel="noopener noreferrer" className="text-[#7aaa7a] hover:underline">xserra</a> (CC-BY 4.0)</li>
              <li><span className="text-[#888]">Voice</span> — sustained E vocal by <a href="https://freesound.org/people/Mafon2/sounds/110423/" target="_blank" rel="noopener noreferrer" className="text-[#7aaa7a] hover:underline">Mafon2</a> (CC-BY 4.0)</li>
              <li><span className="text-[#555]">Tanpura · Bagpipe · Choir — Freesound (CC0).  Harmonium · Church Organ — tonejs-instruments (MIT).</span></li>
            </ul>
          </div>
        </div>
      </div>

      {mergeState && (
        <SyncMergeDialog
          diff={mergeState.diff}
          onApply={applyMerge}
          onCancel={() => setMergeState(null)}
        />
      )}
    </div>
  );
}
