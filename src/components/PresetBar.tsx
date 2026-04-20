import { useState, useRef } from "react";
import { getPresets, savePreset, loadPreset, deletePreset, exportData, importData } from "@/lib/storage";

interface Props {
  onPresetLoaded: () => void;
  mode?: "preset" | "exportimport";
}

export default function PresetBar({ onPresetLoaded, mode = "preset" }: Props) {
  const [presets, setPresets] = useState<string[]>(() => Object.keys(getPresets()).sort());
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = () => setPresets(Object.keys(getPresets()).sort());

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2500);
  };

  const handleSave = () => {
    const n = name.trim();
    if (!n) { flash("Enter a preset name"); return; }
    savePreset(n);
    refresh();
    flash(`Saved "${n}"`);
  };

  const handleLoad = (n: string) => {
    if (!n) return;
    if (loadPreset(n)) {
      setName(n);
      onPresetLoaded();
      flash(`Loaded "${n}"`);
    } else {
      flash(`Preset not found`);
    }
  };

  const handleDelete = () => {
    const n = name.trim();
    if (!presets.includes(n)) { flash("Select a preset to delete"); return; }
    if (!confirm(`Delete preset "${n}"?`)) return;
    deletePreset(n);
    refresh();
    setName("");
    flash(`Deleted "${n}"`);
  };

  const handleExport = () => {
    exportData();
    flash("Exported!");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = importData(text);
      if (result.ok) {
        refresh();
        onPresetLoaded();
        flash("Imported! Reloading…");
        setTimeout(() => window.location.reload(), 800);
      } else {
        flash(result.error ?? "Import failed");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (mode === "exportimport") {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={handleExport}
          className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] hover:text-[#aaa] rounded text-xs transition-colors">
          ↓ Export
        </button>
        <button onClick={() => importRef.current?.click()}
          className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] hover:text-[#aaa] rounded text-xs transition-colors">
          ↑ Import
        </button>
        <input ref={importRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
        {msg && <span className="text-xs text-[#7173e6]">{msg}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[#555] font-medium tracking-wide">PRESET</span>

      <select
        value={presets.includes(name) ? name : ""}
        onChange={e => { setName(e.target.value); handleLoad(e.target.value); }}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none max-w-[120px]"
      >
        <option value="">— load —</option>
        {presets.map(p => <option key={p}>{p}</option>)}
      </select>

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
        placeholder="name…"
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none w-24 placeholder-[#444]"
      />

      <button onClick={handleSave}
        className="px-2 py-1 bg-[#1e2a1e] border border-[#2a4a2a] text-[#5a8a5a] hover:text-[#8ac88a] rounded text-xs transition-colors">
        Save
      </button>
      <button onClick={handleDelete}
        className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] hover:text-[#e06060] rounded text-xs transition-colors">
        Del
      </button>

      {msg && <span className="text-xs text-[#7173e6]">{msg}</span>}
    </div>
  );
}
