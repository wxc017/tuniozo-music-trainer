import {
  type DrumVoice,
  VOICE_SHORT, VOICE_COLORS,
  getSyllables,
} from "@/lib/vocalPercussionData";

const ALL_VOICES: DrumVoice[] = ["kick", "snare", "ghost", "hat"];

/**
 * Tiny always-visible syllable matrix cheat sheet.
 * 4 voices × 7 positions. ~1/4 the previous footprint.
 */
export default function VocalPercussionCheatSheet() {
  return (
    <div style={{
      display: "inline-grid", gridTemplateColumns: "16px repeat(7, 24px)",
      gap: "1px", background: "#1a1a1a",
      borderRadius: 3, overflow: "hidden", border: "1px solid #222",
      width: "fit-content",
    }}>
      <div style={{ background: "#0d0d0d", padding: "5px 2px", fontWeight: 700, color: "#333", fontSize: 6, textAlign: "center" }}>
        ·
      </div>
      {[1,2,3,4,5,6,7].map(n => (
        <div key={n} style={{
          background: "#0d0d0d", padding: "5px 2px",
          fontWeight: 700, color: "#444", textAlign: "center", fontSize: 7,
        }}>{n}</div>
      ))}
      {ALL_VOICES.map(voice => (
        <div key={voice} style={{ display: "contents" }}>
          <div style={{
            background: "#0a0a0a", padding: "6px 2px", fontWeight: 700,
            color: VOICE_COLORS[voice], fontSize: 7, textAlign: "center",
          }}>
            {VOICE_SHORT[voice]}
          </div>
          {[1,2,3,4,5,6,7].map(n => (
            <div key={n} style={{
              background: "#0a0a0a", padding: "6px 2px", textAlign: "center",
              color: VOICE_COLORS[voice], fontSize: 7, fontFamily: "monospace",
              fontWeight: 600,
            }}>
              {getSyllables(voice, n)[n-1]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
