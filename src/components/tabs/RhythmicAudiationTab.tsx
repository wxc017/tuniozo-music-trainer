// ── Rhythmic Audiation · Drum Transcriptions ──────────────────────────────
//
// Real drummer recordings, transcribed by ear — the rhythm counterpart to the
// Tonal Audiation Transcriptions tab, locked to the drums corpus.  (The
// generated Grooves/Stickings modes were removed.)

import TranscriptionsTab from "./TranscriptionsTab";

export default function RhythmicAudiationTab({ ensureAudio, playVol = 0.8 }: { ensureAudio: () => Promise<void>; playVol?: number }) {
  return <TranscriptionsTab ensureAudio={ensureAudio} playVol={playVol} lockSources={["drums"]} />;
}
