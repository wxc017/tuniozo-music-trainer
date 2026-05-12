import { PATTERN_SCALE_FAMILIES } from "@/lib/musicTheory";

// Composite key encoding for multi-select mode.  ScalarPermutationsTab
// stores selected tonalities as a Set<string> of "family|mode" keys so
// each entry uniquely identifies one (scaleFam, modeName) pair.
export function tonalityKey(scaleFam: string, modeName: string): string {
  return `${scaleFam}|${modeName}`;
}
export function parseTonalityKey(key: string): { scaleFam: string; modeName: string } {
  const [scaleFam, modeName] = key.split("|");
  return { scaleFam: scaleFam ?? "", modeName: modeName ?? "" };
}

interface Props {
  // Single-select mode (legacy): caller passes the active (scaleFam,
  // modeName) and an onChange callback.  Clicking a button replaces the
  // selection.  Used by IntervalsTab / ScalarTab / etc.
  scaleFam?: string;
  modeName?: string;
  onChange?: (scaleFam: string, modeName: string) => void;
  // Multi-select mode: caller passes a Set of "family|mode" keys and an
  // onToggle callback.  Clicking a button adds/removes that mode from
  // the set.  Used by ScalarPermutationsTab where the user multi-picks
  // tonalities and the engine random-picks (with recency bias) per
  // play.  When `selected` is supplied, single-select props are
  // ignored.
  selected?: Set<string>;
  onToggle?: (scaleFam: string, modeName: string) => void;
}

const FAMILY_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "Major Family",            label: "MAJOR",            color: "#6a9aca" },
  { key: "Harmonic Minor Family",   label: "HARMONIC MINOR",   color: "#c09050" },
  { key: "Melodic Minor Family",    label: "MELODIC MINOR",    color: "#c06090" },
  // Septimal / neutral diatonic families (31-EDO).  The 7 modes per family
  // are mechanical rotations of the parent — they aren't Greek-mode shapes
  // with a sub/neu/sup prefix, so we label them numerically.
  { key: "Subminor Diatonic Family",   label: "SUBMINOR DIATONIC",   color: "#7aaa6a" },
  { key: "Neutral Diatonic Family",    label: "NEUTRAL DIATONIC",    color: "#9a66c0" },
  { key: "Supermajor Diatonic Family", label: "SUPERMAJOR DIATONIC", color: "#cc6a8a" },
  { key: "Subharmonic Diatonic Family", label: "SUBHARMONIC DIATONIC M7",color: "#4a9ac7" },
];

export default function ModeScalePicker({ scaleFam, modeName, onChange, selected, onToggle }: Props) {
  // Multi-select mode is active when `selected` is provided.  Buttons
  // light up for every mode whose composite key is in the set; clicking
  // toggles membership instead of replacing a single selection.
  const isMulti = selected !== undefined;
  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-2">
      <p className="text-xs text-[#888] font-medium">{isMulti ? "MODES (multi-select)" : "MODE"}</p>
      {FAMILY_GROUPS.map(group => {
        const modes = PATTERN_SCALE_FAMILIES[group.key] ?? [];
        return (
          <div key={group.key}>
            <p className="text-[9px] mb-1 font-medium tracking-wider"
               style={{ color: group.color }}>{group.label}</p>
            <div className="flex flex-wrap gap-1">
              {modes.map(mode => {
                const active = isMulti
                  ? selected!.has(tonalityKey(group.key, mode))
                  : (scaleFam === group.key && modeName === mode);
                return (
                  <button key={mode} onClick={() => {
                    if (isMulti) onToggle?.(group.key, mode);
                    else onChange?.(group.key, mode);
                  }}
                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                      active ? "text-white" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                    }`}
                    style={active ? { backgroundColor: group.color + "30", borderColor: group.color, color: group.color } : {}}>
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
