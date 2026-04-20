import { useState } from "react";
import { formatRomanNumeral } from "@/lib/formatRoman";

interface Props {
  onClose: () => void;
}

type DocSection =
  | "overview"
  | "global-controls"
  | "intervals"
  | "chords"
  | "melody"
  | "jazz"
  | "patterns"
  | "drone"
  | "modeid"
  | "drums"
  | "chord-chart"
  | "konnakol"
  | "transcriptions"
  | "phrase-decomp"
  | "practice-log";

const SECTIONS: { key: DocSection; label: string; group: string }[] = [
  { key: "overview", label: "Overview", group: "Basics" },
  { key: "global-controls", label: "Global Controls", group: "Basics" },
  { key: "intervals", label: "Intervals", group: "Spatial Audiation" },
  { key: "chords", label: "Chords", group: "Spatial Audiation" },
  { key: "melody", label: "Melody", group: "Spatial Audiation" },
  { key: "jazz", label: "Jazz Cells", group: "Spatial Audiation" },
  { key: "patterns", label: "Patterns", group: "Spatial Audiation" },
  { key: "drone", label: "Chord Drone", group: "Spatial Audiation" },
  { key: "modeid", label: "Mode ID", group: "Spatial Audiation" },
  { key: "drums", label: "Drum Patterns", group: "Other Modes" },
  { key: "chord-chart", label: "Chord Chart", group: "Other Modes" },
  { key: "konnakol", label: "Solkattu", group: "Other Modes" },
  { key: "transcriptions", label: "Quick Transcriptions", group: "Other Modes" },
  { key: "phrase-decomp", label: "Phrase Decomposition", group: "Other Modes" },
  { key: "practice-log", label: "Practice Log & Stats", group: "Tools" },
];

/* ── Visual mock components ───────────────────────────────────────── */
/* These replicate how the actual UI controls look in the app */

const MockBtn = ({ children, active, color }: { children: React.ReactNode; active?: boolean; color?: string }) => (
  <span
    className="inline-flex items-center rounded text-[10px] font-medium border px-2 py-0.5 select-none"
    style={{
      background: active ? (color || "#7173e6") : "#1a1a1a",
      borderColor: active ? (color || "#7173e6") : "#333",
      color: active ? "#fff" : "#888",
    }}
  >
    {children}
  </span>
);

const MockSelect = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-0.5 text-[10px] text-white select-none">
    {children}
    <svg width="8" height="8" viewBox="0 0 12 12" fill="#666"><path d="M3 5l3 3 3-3z" /></svg>
  </span>
);

const MockInput = ({ value, w }: { value: string; w?: number }) => (
  <span
    className="inline-flex items-center justify-center rounded border border-[#2a2a2a] bg-[#1a1a1a] py-0.5 text-[10px] text-white text-center select-none"
    style={{ width: w || 36, paddingLeft: 4, paddingRight: 4 }}
  >
    {value}
  </span>
);

const MockCheck = ({ checked, label }: { checked?: boolean; label: string }) => (
  <span className="inline-flex items-center gap-1.5 select-none">
    <span
      className="inline-flex items-center justify-center rounded-sm border text-[8px]"
      style={{
        width: 13, height: 13,
        borderColor: checked ? "#7173e6" : "#444",
        background: checked ? "#7173e6" : "transparent",
        color: "#fff",
      }}
    >
      {checked && "✓"}
    </span>
    <span className="text-[10px] text-[#ccc]">{formatRomanNumeral(label)}</span>
  </span>
);

const MockSlider = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex items-center gap-2 select-none">
    <span className="text-[10px] text-[#666]">{label}</span>
    <span className="relative inline-block w-16 h-1 rounded bg-[#333]">
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#7173e6]" />
    </span>
    <span className="text-[10px] text-[#555]">{value}</span>
  </span>
);

const MockToggle = ({ options, active }: { options: string[]; active: number }) => (
  <span className="inline-flex gap-0.5 select-none">
    {options.map((o, i) => (
      <span
        key={o}
        className="px-2 py-0.5 rounded text-[10px] font-medium border"
        style={{
          background: i === active ? "#7173e6" : "#1a1a1a",
          borderColor: i === active ? "#7173e6" : "#333",
          color: i === active ? "#fff" : "#888",
        }}
      >
        {o}
      </span>
    ))}
  </span>
);

const MockRadio = ({ options, active }: { options: string[]; active: number }) => (
  <span className="inline-flex gap-2 select-none">
    {options.map((o, i) => (
      <span key={o} className="inline-flex items-center gap-1">
        <span
          className="inline-block rounded-full border"
          style={{
            width: 11, height: 11,
            borderColor: i === active ? "#7173e6" : "#444",
            background: i === active ? "#7173e6" : "transparent",
            boxShadow: i === active ? "inset 0 0 0 2px #111" : "none",
          }}
        />
        <span className="text-[10px] text-[#ccc]">{o}</span>
      </span>
    ))}
  </span>
);

const MockDot = ({ color }: { color: string }) => (
  <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
);

/* a full row showing the mock element + description */
const Row = ({ mock, children }: { mock: React.ReactNode; children: React.ReactNode }) => (
  <div className="mb-4 flex flex-col gap-1.5">
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2 inline-flex items-center gap-2 flex-wrap w-fit">
      {mock}
    </div>
    <div className="text-sm text-[#bbb] leading-relaxed pl-1">{children}</div>
  </div>
);

/* ── Text helpers ─────────────────────────────────────────────────── */

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-lg font-bold text-white mb-3 mt-0">{children}</h2>
);

const Sub = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-semibold text-[#c8aa50] mt-6 mb-2">{children}</h3>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-[#bbb] leading-relaxed mb-3">{children}</p>
);

const DiagramBox = ({ children, label }: { children: React.ReactNode; label?: string }) => (
  <div className="bg-[#0a0a0a] border border-[#222] rounded-lg p-4 mb-4 font-mono text-xs leading-relaxed">
    {label && <div className="text-[#555] mb-2 font-sans text-xs uppercase tracking-wider">{label}</div>}
    {children}
  </div>
);

/* ── Section content ──────────────────────────────────────────────── */

function OverviewContent() {
  return (
    <>
      <Sub>The Six Main Sections</Sub>
      <P>Use the dropdown in the top-left corner to switch between these sections:</P>

      <DiagramBox label="Section Selector">
        <div className="space-y-1">
          <div><span className="text-[#7173e6]">Spatial Audiation</span> <span className="text-[#555]">-- 7 training tabs for pitch & harmony</span></div>
          <div><span className="text-[#7173e6]">Drum Patterns</span> <span className="text-[#555]">-- rhythmic pattern building & practice</span></div>
          <div><span className="text-[#7173e6]">Chord Chart</span> <span className="text-[#555]">-- write out chord progressions</span></div>
          <div><span className="text-[#7173e6]">Solkattu</span> <span className="text-[#555]">-- South Indian vocal rhythm training</span></div>
          <div><span className="text-[#7173e6]">Quick Transcriptions</span> <span className="text-[#555]">-- notate melodies from recordings</span></div>
          <div><span className="text-[#7173e6]">Phrase Decomposition</span> <span className="text-[#555]">-- analyze & transform musical ideas</span></div>
        </div>
      </DiagramBox>
    </>
  );
}

function GlobalControlsContent() {
  return (
    <>
      <Heading>Global Controls</Heading>
      <P>These controls appear at the top of the screen and are always available.</P>

      <Sub>Section Selector</Sub>
      <Row mock={
        <MockSelect>Spatial Audiation</MockSelect>
      }>
        Dropdown on the far left of the header. Switches between the six main sections.
        Options: <em>Spatial Audiation, Drum Patterns, Chord Chart, Solkattu, Quick Transcriptions, Phrase Decomposition</em>.
      </Row>

      <Sub>Practice Log & Settings</Sub>
      <Row mock={
        <>
          <MockBtn active color="#0e4a0e">Practice Log</MockBtn>
          <MockBtn>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/></svg>
          </MockBtn>
        </>
      }>
        <strong className="text-white">Practice Log</strong> (green button): opens a calendar showing
        all saved sessions. Click any past session to restore its settings.<br/>
        <strong className="text-white">Gear icon</strong>: opens Settings -- data export/import and beta features.
      </Row>

      <Sub>Metronome</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">BPM</span>
          <MockInput value="120" w={48}/>
          <MockBtn active>Start</MockBtn>
          <MockDot color="#7173e6"/>
        </>
      }>
        <strong className="text-white">BPM</strong>: beats per minute (20-300). Type a value or use arrow keys.<br/>
        <strong className="text-white">Start / Stop</strong>: toggles the metronome click.<br/>
        <strong className="text-white">Dot indicator</strong>: grey when stopped, blue when running,
        gold with a scale animation on the accent beat.
      </Row>

      <Sub>Countdown Timer</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-white font-mono">05:00</span>
          <span className="relative inline-block w-20 h-1 rounded bg-[#333]">
            <span className="absolute left-0 top-0 h-full rounded bg-[#7173e6]" style={{width:"70%"}} />
          </span>
          <MockBtn>▶</MockBtn>
          <MockBtn>↺</MockBtn>
          <MockBtn>✎</MockBtn>
        </>
      }>
        <strong className="text-white">Time display (MM:SS)</strong>: click the pencil icon to edit minutes and seconds manually.
        When editing, you get two number inputs (min: 0-99, sec: 0-59) and a "Set" button.<br/>
        <strong className="text-white">▶ / ⏸</strong>: start or pause the countdown.<br/>
        <strong className="text-white">↺</strong>: reset to your set duration.<br/>
        <strong className="text-white">✎</strong>: enter edit mode (only when not running).<br/>
        <strong className="text-white">Progress bar</strong>: green normally, orange at ≤30 seconds, red and pulsing when expired.
        Three alert tones (880 Hz) play at zero. Default duration: 5 minutes.
      </Row>

      <Sub>Drone Strip (Spatial Audiation section only)</Sub>
      <P>A drone is a sustained background note or chord that provides harmonic reference while you practice.</P>

      <Row mock={
        <>
          <span className="text-[10px] font-semibold text-[#888] tracking-widest uppercase">Drone</span>
          <MockBtn active>ON</MockBtn>
          <MockBtn active color="#3a1a1a">OFF</MockBtn>
        </>
      }>
        <strong className="text-white">ON</strong>: starts the drone (turns purple when active, blue pulsing dot appears next to "Drone" label).<br/>
        <strong className="text-white">OFF</strong>: stops the drone (turns red when active).
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">Tonal</span>
          <MockInput value="0" w={40}/>
        </>
      }>
        Which pitch class the drone plays (number input, 0-30). 0 = the tonic of your tuning system.
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">Oct</span>
          <MockSelect>4</MockSelect>
        </>
      }>
        Octave of the drone. Dropdown with options: 1, 2, 3, 4, 5, 6, 7. Lower = deeper bass, higher = brighter.
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">Mode</span>
          <MockSelect>Single</MockSelect>
        </>
      }>
        Drone voicing. Dropdown options:<br/>
        <strong className="text-white">Single</strong>: one sustained note.<br/>
        <strong className="text-white">Root+5th</strong>: root plus the note a perfect 5th above (stable "power chord").<br/>
        <strong className="text-white">Tanpura</strong>: root + 5th + lower octave root for a rich Indian drone sound.
      </Row>

      <Row mock={<MockSlider label="Vol" value="27%"/>}>
        Drone volume. Range slider: 0% to 100% (internally 0 to 0.3, step 0.005).
      </Row>

      <Row mock={
        <>
          <MockBtn active>Pulse</MockBtn>
          <MockInput value="4" w={40}/>
          <span className="text-[10px] text-[#555]">sec</span>
        </>
      }>
        <strong className="text-white">Pulse</strong>: when enabled (purple), the drone alternates between playing and silence.
        Trains you to maintain pitch sense when the reference disappears.<br/>
        <strong className="text-white">Duration</strong> (number input, 1-60 seconds): how long each on/off phase lasts.
        Only visible when Pulse is enabled.
      </Row>

      <Sub>Keyboard Display</Sub>
      <P>
        The hexagonal Lumatone-style keyboard shows every pitch in your EDO system. Notes light up
        in blue when the app plays them. Click any hexagon to hear its pitch.
      </P>

      <Sub>Self-Assessment (below keyboard)</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#555]">Got it?</span>
          <MockBtn active color="#1a3a1a">✓</MockBtn>
          <MockBtn active color="#3a1a1a">✗</MockBtn>
          <span className="text-[10px] ml-2">
            <span style={{color:"#5cca5c"}}>✓12</span>{" "}
            <span style={{color:"#e06060"}}>✗3</span>{" "}
            <span style={{color:"#666"}}>80%</span>
          </span>
        </>
      }>
        Appears in "Play Audio" mode after a question is played.<br/>
        <strong className="text-[#5cca5c]">✓</strong>: I identified it correctly.<br/>
        <strong className="text-[#e06060]">✗</strong>: I got it wrong.<br/>
        <strong className="text-white">Tally</strong>: shows today's correct/wrong count and accuracy percentage.
        This data feeds weighted statistics -- items you get wrong appear more often.
      </Row>

      <Sub>EDO Selector</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">EDO</span>
          <MockSelect>31</MockSelect>
        </>
      }>
        Switches the tuning system. Dropdown options: 12, 17, 19, 31, 53.<br/>
        12 = standard Western tuning (piano keys). Higher numbers = more notes per octave (microtonal).
        Default: 31.
      </Row>

      <Sub>Spatial Audiation Controls (above tab buttons)</Sub>

      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">Tonic</span>
          <MockInput value="0" w={44}/>
          <span className="text-[10px] text-[#444]">/ 31</span>
        </>
      }>
        The "home note" for all exercises. Number input (0 to EDO-1). In 12-EDO: 0=C, 1=C#, 2=D, etc.
        The "/ 31" label shows your current EDO.
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">Low Oct</span>
          <MockSelect>3</MockSelect>
          <span className="text-[10px] text-[#666]">High Oct</span>
          <MockSelect>5</MockSelect>
        </>
      }>
        Octave range for generated notes. Both are dropdowns with options 1-7.
        A wider range = notes can appear in more registers, making identification harder.
        Default: Low 3, High 5.
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#666]">Mode</span>
          <MockSelect>Play Audio</MockSelect>
        </>
      }>
        Response mode dropdown:<br/>
        <strong className="text-white">Play Audio</strong>: the app plays sound, you listen and identify, then self-assess with ✓/✗.<br/>
        <strong className="text-white">Show Target (Sing It)</strong>: the app highlights notes on the keyboard
        without playing audio. You sing or play the shown notes on your instrument.
      </Row>

      <Row mock={<MockSlider label="Play Vol" value="100%"/>}>
        Master volume for all played notes. Range: 0% to 150% (internally 0 to 1.5, step 0.01). Default: 100%.
      </Row>

      <Sub>Preset Bar</Sub>
      <Row mock={
        <>
          <MockSelect>— load —</MockSelect>
          <MockInput value="name…" w={72}/>
          <MockBtn>Save</MockBtn>
          <MockBtn>Del</MockBtn>
        </>
      }>
        <strong className="text-white">Load dropdown</strong>: select a saved preset to restore all settings instantly.<br/>
        <strong className="text-white">Name input</strong>: type a name for a new preset.<br/>
        <strong className="text-white">Save</strong>: stores all current settings (all tabs, all options) under that name.<br/>
        <strong className="text-white">Del</strong>: deletes the currently selected preset.
      </Row>
    </>
  );
}

function IntervalsContent() {
  return (
    <>
      <Heading>Intervals Tab</Heading>
      <P>
        An interval is the distance between two notes. This tab generates random intervals from
        your selected set and plays them in various styles.
      </P>

      <Sub># Notes</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]"># Notes</span>
          <MockToggle options={["1","2","3","4","5","6"]} active={1}/>
        </>
      }>
        How many notes are generated per question. Default: 2. With 1, you hear a single interval from the tonic.
        With more, you hear a sequence of intervals played one after another (or simultaneously depending on play style).
      </Row>

      <Sub>Play Style</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Play Style</span>
          <MockSelect>Sequential</MockSelect>
        </>
      }>
        Dropdown with 4 options:<br/>
        <strong className="text-white">Sequential</strong>: notes play one at a time with 650ms gap between each.<br/>
        <strong className="text-white">Dyad (2 at once)</strong>: groups notes into pairs, plays both simultaneously as harmonic intervals.<br/>
        <strong className="text-white">Trichord (3 at once)</strong>: groups 3 notes together, plays them as a chord.<br/>
        <strong className="text-white">Random (2-3 at once)</strong>: randomly groups notes into clusters of 2 or 3.
      </Row>

      <Sub>Interval Selection</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockCheck checked label="3 nP4"/>
          <MockCheck checked label="5 P4"/>
          <MockCheck label="7 dim5"/>
          <MockCheck checked label="8 P5"/>
          <MockCheck label="10 m6"/>
          <span className="text-[10px] text-[#555]">…</span>
        </div>
      }>
        Grid of checkboxes, one per interval in your EDO system. Each shows the step number and interval name
        (e.g. "3 nP4", "5 P4", "8 P5"). Check the intervals you want included in the random pool.
        Default selection: steps 3, 5, 8, 10, 13, 15, 18, 21, 23, 26, 28.
      </Row>

      <Row mock={
        <>
          <MockBtn>All</MockBtn>
          <MockBtn>None</MockBtn>
        </>
      }>
        <strong className="text-white">All</strong>: selects every interval.
        <strong className="text-white"> None</strong>: clears all selections.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Play</MockBtn>
          <MockBtn>Replay</MockBtn>
          <MockBtn>ℹ Show Info</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Play</strong>: generates a new random interval sequence and plays it. Volume: 0.65.<br/>
        <strong className="text-white">Replay</strong>: plays the exact same sequence again. Only visible after first play.<br/>
        <strong className="text-white">ℹ Show Info</strong>: reveals which intervals were played. Only visible in "Show Target" mode
        or after playing.
      </Row>

      <Sub>Info Display</Sub>
      <Row mock={
        <div className="bg-[#1a2a1a] border border-[#3a5a3a] rounded px-3 py-1.5">
          <span className="text-[10px] text-[#8fc88f]">Target: P5 up (8 steps)</span>
        </div>
      }>
        Green box showing the interval name and step count. Appears when "Show Info" is clicked or in "Show Target" mode.
      </Row>
    </>
  );
}

function ChordsContent() {
  return (
    <>
      <Heading>Chords Tab</Heading>
      <P>
        Generates random chord progressions with full control over voicing, inversions, and extensions.
        A chord is three or more notes played simultaneously.
      </P>

      <Sub>Formula</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <MockCheck checked label="I X I"/>
          <MockCheck checked label="ii/X V/X X"/>
          <MockCheck label="iiø/X V/X X"/>
        </div>
      }>
        Checkboxes for pre-built progression templates:<br/>
        <strong className="text-white">I X I</strong>: plays chord I, then a random chord from your selection, then I again.
        The I chords provide a "home" reference.<br/>
        <strong className="text-white">ii/X V/X X</strong>: secondary dominant pattern (major key). Creates a ii-V approach to a
        random target chord. <em className="text-[#555]">Shown with "major X only" note.</em><br/>
        <strong className="text-white">iiø/X V/X X</strong>: same but minor-key ii-V (half-diminished ii, dominant V). <em className="text-[#555]">Shown with "minor X only" note.</em>
      </Row>

      <Sub>Inversion</Sub>
      <Row mock={
        <div className="flex gap-2">
          <MockCheck checked label="Root"/>
          <MockCheck checked label="1st"/>
          <MockCheck checked label="2nd"/>
          <MockCheck label="3rd"/>
        </div>
      }>
        Which inversions are allowed (must keep at least one). Default: Root, 1st, 2nd checked.<br/>
        <strong className="text-white">Root (0)</strong>: chord root on the bottom. Most stable.<br/>
        <strong className="text-white">1st</strong>: 3rd in the bass. Smoother voice leading.<br/>
        <strong className="text-white">2nd</strong>: 5th in the bass. Open, sometimes unstable.<br/>
        <strong className="text-white">3rd</strong>: 7th in the bass. Only for 7th+ chords. Very smooth in jazz.
      </Row>

      <Sub>Register</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Register</span>
          <MockSelect>Fixed Register</MockSelect>
        </>
      }>
        Dropdown with 3 options:<br/>
        <strong className="text-white">Fixed Register</strong>: all chords stay in the same octave range.<br/>
        <strong className="text-white">Random Bass Octave</strong>: bass note jumps between octaves, upper voices stay fixed.<br/>
        <strong className="text-white">Random Full Register</strong>: all notes randomized across octave range. Hardest setting.
      </Row>

      <Sub>Bass</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Bass</span>
          <MockSelect>Both</MockSelect>
        </>
      }>
        Dropdown with 3 options:<br/>
        <strong className="text-white">Triad Only</strong>: bass uses root, 3rd, or 5th only.<br/>
        <strong className="text-white">Extensions Only</strong>: bass uses extension notes (7th, 9th, etc.).<br/>
        <strong className="text-white">Both</strong>: bass can be any chord tone. Default.
      </Row>

      <Sub>Extension Tendency</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">EXT TENDENCY</span>
          <MockRadio options={["Any","Stable","Avoid"]} active={0}/>
        </>
      }>
        Radio button group (mutually exclusive):<br/>
        <strong className="text-white">Any</strong>: no filtering on extensions. Default.<br/>
        <strong className="text-white">Stable</strong>: extensions must be notes that exist in the current scale (consonant).<br/>
        <strong className="text-white">Avoid</strong>: extensions must be outside the current scale (dissonant, colorful).
      </Row>

      <Sub>Extensions</Sub>
      <Row mock={
        <div className="flex gap-2">
          <MockCheck checked label="7th"/>
          <MockCheck label="9th"/>
          <MockCheck label="11th"/>
          <MockCheck label="13th"/>
        </div>
      }>
        Checkboxes for upper extensions added above the basic triad. Default: 7th checked only.<br/>
        Each adds the note that many scale steps above the root. More extensions = richer, more complex chords.
      </Row>

      <Sub># Notes</Sub>
      <Row mock={
        <div className="flex gap-2">
          <MockCheck checked label="3"/>
          <MockCheck checked label="4"/>
          <MockCheck label="5"/>
          <MockCheck label="6"/>
          <MockCheck label="7"/>
        </div>
      }>
        How many notes per chord. Checkboxes (multiple allowed). Default: 3 and 4 checked.<br/>
        3 = triad, 4 = seventh chord, 5+ = extended chords.
      </Row>

      <Sub>Voicings</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <MockCheck checked label="Close"/>
          <MockCheck label="Drop-2"/>
          <MockCheck label="Drop-3"/>
          <MockCheck label="Drop-2&4"/>
        </div>
      }>
        <strong className="text-white">Close</strong>: notes clustered within one octave. Default.<br/>
        <strong className="text-white">Drop-2</strong>: second-from-top note dropped an octave. Jazz guitar staple. <em className="text-[#555]">Requires 4+ notes.</em><br/>
        <strong className="text-white">Drop-3</strong>: third-from-top dropped. <em className="text-[#555]">Requires 4+ notes.</em><br/>
        <strong className="text-white">Drop-2&4</strong>: 2nd and 4th from top dropped. Wide spread. <em className="text-[#555]">Requires 4+ notes.</em>
      </Row>

      <Sub>Chord Selection</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockCheck checked label="I"/>
          <MockCheck checked label="IV"/>
          <MockCheck checked label="V"/>
          <MockCheck checked label="vi"/>
          <MockCheck checked label="ii"/>
          <MockCheck checked label="iii"/>
          <MockCheck checked label="vii°"/>
          <span className="text-[10px] text-[#555]">…</span>
        </div>
      }>
        Checkboxes for every chord built from your EDO system. Uppercase = major, lowercase = minor.
        Default: I, IV, V, vi, ii, iii, vii° checked. Select which Roman numeral chords can appear as the random chord.
      </Row>

      <Row mock={
        <>
          <MockBtn>All</MockBtn>
          <MockBtn>None</MockBtn>
        </>
      }>
        Quick-select or clear all chord types.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Play Progression</MockBtn>
          <MockBtn>Replay</MockBtn>
          <MockBtn>ℹ Show Info</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Play Progression</strong>: generates and plays a chord sequence with 1000ms between chords. Volume: 0.55.<br/>
        <strong className="text-white">Replay</strong>: repeats the same progression. Visible after first play.<br/>
        <strong className="text-white">ℹ Show Info</strong>: shows each chord's pitch classes and quality.
      </Row>
    </>
  );
}

function MelodyContent() {
  return (
    <>
      <Heading>Melody Tab</Heading>
      <P>
        A melody is a sequence of single notes forming a musical phrase. This tab generates random
        melodies from different families.
      </P>

      <Sub>Melody Families</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1">
            <MockCheck checked label="Cadences"/>
            <span className="text-[8px] px-1 py-0.5 rounded bg-[#1a2a1a] text-[#7aaa7a] border border-[#2a3a2a]">generative</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MockCheck checked label="Folk / Pop Phrases"/>
            <span className="text-[8px] px-1 py-0.5 rounded bg-[#1a1a2a] text-[#7173e6] border border-[#2a2a3a]">fixed bank</span>
          </span>
        </div>
      }>
        Checkboxes for each melody family. Each has a badge: <span className="text-[#7aaa7a]">generative</span> (created
        fresh from scale/mode settings) or <span className="text-[#7173e6]">fixed bank</span> (pre-composed, not affected by scale/mode).<br/><br/>
        Available families: <strong className="text-white">Cadences</strong> (resolving phrases),{" "}
        <strong className="text-white">Pentatonic Hooks</strong> (5-note scale melodies),{" "}
        <strong className="text-white">Neighbor-Tone Cells</strong> (orbiting motifs),{" "}
        <strong className="text-white">Triadic Shapes</strong> (chord-tone outlines),{" "}
        <strong className="text-white">Folk / Pop Phrases</strong> (pre-composed bank).
        All checked by default.
      </Row>

      <Sub>Length Filter</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Length Filter</span>
          <MockSelect>Any</MockSelect>
        </>
      }>
        Dropdown: Any, 3, 4, 5, 6, 7, 8, 10, 12 notes. Filters melodies by note count. Default: Any.
      </Row>

      <Sub>Scale Family</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Scale Family</span>
          <MockSelect>Major Family</MockSelect>
          <span className="text-[8px] text-[#555]">(generative)</span>
        </>
      }>
        Dropdown with "(generative)" label. Only affects generative families.<br/>
        Options: <strong className="text-white">Major Family</strong> (bright, happy),{" "}
        <strong className="text-white">Harmonic Minor Family</strong> (exotic),{" "}
        <strong className="text-white">Melodic Minor Family</strong> (jazzy). Default: Major Family.
      </Row>

      <Sub>Mode</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Mode</span>
          <MockSelect>Ionian</MockSelect>
          <span className="text-[8px] text-[#555]">(generative)</span>
        </>
      }>
        Dropdown with "(generative)" label. Options change based on selected Scale Family.
        For Major Family: Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian. Default: Ionian.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Random Melody</MockBtn>
          <MockBtn>Replay</MockBtn>
          <MockBtn>ℹ Show Info</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Random Melody</strong>: generates and plays a melody (600ms gap between notes, volume 0.65).
        Changes to "♪ Playing…" while active.<br/>
        <strong className="text-white">Replay</strong>: plays the same melody. Visible after first play.<br/>
        <strong className="text-white">ℹ Show Info</strong>: shows the degree sequence (e.g. 1 → 3 → 5 → 2).
      </Row>
    </>
  );
}

function JazzContent() {
  return (
    <>
      <Heading>Jazz Cells Tab</Heading>
      <P>
        Jazz cells are short melodic fragments used in jazz improvisation. All families are generative.
      </P>

      <Sub>Jazz Cell Families</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1">
            <MockCheck checked label="Chord Tone Arpeggios"/>
            <span className="text-[8px] px-1 py-0.5 rounded bg-[#1a2a1a] text-[#7aaa7a] border border-[#2a3a2a]">generative</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MockCheck checked label="Enclosures"/>
            <span className="text-[8px] px-1 py-0.5 rounded bg-[#1a2a1a] text-[#7aaa7a] border border-[#2a3a2a]">generative</span>
          </span>
        </div>
      }>
        All families have the "generative" badge. Default checked:{" "}
        <strong className="text-white">Chord Tone Arpeggios</strong> (chord notes played one at a time),{" "}
        <strong className="text-white">Enclosures</strong> (approach target from above and below),{" "}
        <strong className="text-white">Bebop Fragments</strong> (scalar runs with chromatic passing tones),{" "}
        <strong className="text-white">Guide-Tone Lines</strong> (smooth lines connecting 3rds and 7ths).
      </Row>

      <Sub>Length Filter</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Length Filter</span>
          <MockSelect>Any</MockSelect>
        </>
      }>
        Dropdown: Any, 3, 4, 5, 6, 7, 8, 9 notes. Default: Any.
      </Row>

      <Sub>Scale Family & Mode</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Scale Family</span>
          <MockSelect>Major Family</MockSelect>
          <span className="text-[10px] text-[#888] ml-2">Mode</span>
          <MockSelect>Ionian</MockSelect>
        </>
      }>
        Same as Melody tab. Scale Family: Major, Harmonic Minor, Melodic Minor. Mode: depends on family.
        Default: Major Family / Ionian.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Random Jazz Cell</MockBtn>
          <MockBtn>Replay</MockBtn>
          <MockBtn>ℹ Show Info</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Random Jazz Cell</strong>: generates and plays (550ms gap, volume 0.8).
        Shows "♪ Playing…" while active.<br/>
        <strong className="text-white">Replay</strong>: visible after first play.<br/>
        <strong className="text-white">ℹ Show Info</strong>: shows scale degrees.
      </Row>
    </>
  );
}

function PatternsContent() {
  return (
    <>
      <Heading>Patterns Tab</Heading>
      <P>
        Systematic note sequences derived from scales. Technical exercises for building fluency. All generative.
      </P>

      <Sub>Scale Family & Mode</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Scale Family</span>
          <MockSelect>Major Family</MockSelect>
          <span className="text-[10px] text-[#888] ml-2">Mode</span>
          <MockSelect>Ionian</MockSelect>
        </>
      }>
        Same dropdowns as Melody/Jazz tabs. Scale Family + Mode determine which scale the patterns are built from.
      </Row>

      <Sub>Length</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Length</span>
          <MockSelect>Any</MockSelect>
        </>
      }>
        Dropdown: Any, 3, 4, 5, 6, 7, 8, 10, 12 notes. Default: Any.
      </Row>

      <Sub>Pattern Families</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <MockCheck checked label="Scalar Sequences"/>
          <MockCheck checked label="Interval Chains"/>
          <MockCheck checked label="Skip Patterns"/>
          <MockCheck checked label="Cell Sequences"/>
          <MockCheck checked label="Triad Sequences"/>
        </div>
      }>
        All checked by default. All generative.<br/>
        <strong className="text-white">Scalar Sequences</strong>: scale in groups (1-2-3, 2-3-4, 3-4-5…).<br/>
        <strong className="text-white">Interval Chains</strong>: same interval repeated (every 3rd: 1-3, 2-4…).<br/>
        <strong className="text-white">Skip Patterns</strong>: alternating step and jump.<br/>
        <strong className="text-white">Cell Sequences</strong>: short motif repeated on each scale degree.<br/>
        <strong className="text-white">Triad Sequences</strong>: arpeggios on successive scale degrees.
      </Row>

      <Row mock={
        <>
          <MockBtn>All</MockBtn>
          <MockBtn>None</MockBtn>
        </>
      }>
        Quick-select or clear all families.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Random Pattern</MockBtn>
          <MockBtn>Replay</MockBtn>
          <MockBtn>ℹ Show Info</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Random Pattern</strong>: generates and plays (580ms gap, volume 0.8). Shows "♪ Playing…" while active.<br/>
        <strong className="text-white">Replay</strong>: visible after first play.<br/>
        <strong className="text-white">ℹ Show Info</strong>: shows degree labels (1, 2, 3…).
      </Row>

    </>
  );
}

function DroneContent() {
  return (
    <>
      <Heading>Chord Drone Tab</Heading>
      <P>
        Plays a sustained chord and optionally adds a single note on top. You identify the
        relationship between the drone chord and the added note.
      </P>

      <Sub>Drone Degree (random)</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn active>1</MockBtn>
          <MockBtn>b2</MockBtn>
          <MockBtn>2</MockBtn>
          <MockBtn>b3</MockBtn>
          <MockBtn>3</MockBtn>
          <MockBtn>4</MockBtn>
          <span className="text-[10px] text-[#555]">…</span>
          <span className="ml-2"/>
          <MockBtn>All</MockBtn>
          <MockBtn>Reset</MockBtn>
        </div>
      }>
        Toggle buttons for each chromatic scale degree. The app randomly picks one as the drone root.
        Default: only "1" selected.<br/>
        <strong className="text-white">All</strong>: select every degree. <strong className="text-white">Reset</strong>: back to just "1".
      </Row>

      <Sub>Drone Chord Types</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <MockCheck checked label="Major Triad"/>
          <MockCheck checked label="Dominant 7"/>
          <MockCheck label="Minor Triad"/>
          <MockCheck label="Half-Diminished"/>
          <MockCheck label="Augmented"/>
          <span className="text-[10px] text-[#555]">…</span>
        </div>
      }>
        Checkboxes for chord qualities. The app randomly picks from checked types.
        Default: Major Triad and Dominant 7 checked. The full list depends on your EDO system.
      </Row>

      <Sub>Intervals Over Drone</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockCheck label="0 P1"/>
          <MockCheck label="1 m2"/>
          <MockCheck label="2 M2"/>
          <MockCheck label="3 m3"/>
          <span className="text-[10px] text-[#555]">…up to 12…</span>
          <span className="ml-2"/>
          <MockBtn>All</MockBtn>
          <MockBtn>None</MockBtn>
        </div>
      }>
        Checkboxes for each interval (in EDO steps relative to drone root). The app randomly plays
        one of these as an added note over the drone. Default: none selected (drone chord only).<br/>
        <strong className="text-white">All / None</strong>: quick-select or clear.
      </Row>

      <Sub>Duration</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Duration (sec)</span>
          <MockSelect>4</MockSelect>
        </>
      }>
        How long the drone chord sustains. Dropdown: 1, 2, 3, 4, 5 seconds. Default: 4.
      </Row>

      <Sub>Voicing</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Voicing</span>
          <MockSelect>Close</MockSelect>
        </>
      }>
        How the chord notes are spread. Default: Close. Other options depend on available voicing types.
      </Row>

      <Sub>Interval Timing</Sub>
      <Row mock={
        <MockToggle options={["After drone","Over drone"]} active={0}/>
      }>
        Toggle between two modes:<br/>
        <strong className="text-white">After drone</strong>: the interval note plays after the drone chord stops. Tests your memory of the chord sound. Default.<br/>
        <strong className="text-white">Over drone</strong>: the interval note plays midway through the drone. Tests real-time harmonic hearing.
      </Row>

      <Sub>Volume Controls</Sub>
      <Row mock={<MockSlider label="Drone vol" value="12%"/>}>
        Drone chord volume. Range: 1% to 50% (internally 0.01 to 0.5, step 0.01). Default: 12%.
      </Row>
      <Row mock={<MockSlider label="Interval vol" value="65%"/>}>
        Added interval note volume. Range: 1% to 150% (internally 0.01 to 1.5, step 0.01). Default: 65%.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Play</MockBtn>
          <MockBtn>Replay</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Play</strong>: plays the drone chord (and interval note if any are selected). Button changes to
        <strong className="text-white"> ⏹ Stop</strong> during playback -- click to stop early.<br/>
        <strong className="text-white">Replay</strong>: repeats with the same drone and interval. Visible after first play.
      </Row>
    </>
  );
}

function ModeIdContent() {
  return (
    <>
      <Heading>Mode Identification Tab</Heading>
      <P>
        Generates random modal phrases and asks you to identify which of 21 modes was used.
      </P>

      <Sub>Mode Pool</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Mode pool</span>
          <MockSelect>Major modes (7)</MockSelect>
        </>
      }>
        Dropdown with 4 options:<br/>
        <strong className="text-white">Major modes (7)</strong>: Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian.<br/>
        <strong className="text-white">Harmonic minor (7)</strong>: Harmonic Minor, Locrian ♮6, Ionian ♯5, Dorian ♯4, Phrygian Dominant, Lydian ♯2, Superlocrian ♭♭7.<br/>
        <strong className="text-white">Melodic minor (7)</strong>: Melodic Minor, Dorian ♭2, Lydian Augmented, Lydian Dominant, Mixolydian ♭6, Locrian ♮2, Altered.<br/>
        <strong className="text-white">All modes (21)</strong>: all of the above. Default: Major modes.
      </Row>

      <Sub>Max Notes</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Max notes</span>
          <MockSelect>8</MockSelect>
        </>
      }>
        Dropdown: 4, 5, 6, 7, 8, 10, 12 notes. More notes = more information but requires more focused listening. Default: 8.
      </Row>

      <Sub>Pattern Types</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <MockCheck checked label="Stepwise"/>
          <MockCheck checked label="Arpeggio"/>
          <MockCheck checked label="Jump"/>
          <MockCheck checked label="Character"/>
          <MockCheck checked label="Mixed"/>
        </div>
      }>
        Checkboxes for phrase generation style. All checked by default.<br/>
        <strong className="text-white">Stepwise</strong>: notes move by small scale steps.<br/>
        <strong className="text-white">Arpeggio</strong>: notes outline chord tones (1, 3, 5).<br/>
        <strong className="text-white">Jump</strong>: large intervallic leaps.<br/>
        <strong className="text-white">Character</strong>: heavily weights the mode's unique distinguishing tones.<br/>
        <strong className="text-white">Mixed</strong>: random combination of all.
      </Row>

      <Sub>Use Characteristic Chord</Sub>
      <Row mock={
        <div className="flex flex-wrap items-center gap-3">
          <MockCheck checked label="Use characteristic chord"/>
          <MockSlider label="Chord vol" value="56%"/>
          <span className="text-[10px] text-[#888]">Drone</span>
          <MockSelect>Sustain through</MockSelect>
        </div>
      }>
        <strong className="text-white">Checkbox</strong>: when enabled, a chord built from the mode's characteristic notes
        plays before/during the melody. Makes identification easier. Default: unchecked.<br/><br/>
        <em>The following only appear when the checkbox is enabled:</em><br/>
        <strong className="text-white">Chord vol</strong>: volume slider, 10% to 80% (internally 0.1 to 0.8, step 0.05). Display: percentage of 0.8. Default: 0.45.<br/>
        <strong className="text-white">Drone</strong>: dropdown with 2 options:<br/>
        &nbsp;&nbsp;<strong className="text-white">Intro only</strong>: chord plays then stops before melody (1300ms lead).<br/>
        &nbsp;&nbsp;<strong className="text-white">Sustain through</strong>: chord continues under the entire melody. Default.
      </Row>

      <Sub>Action Buttons</Sub>
      <Row mock={
        <>
          <MockBtn active>▶ Play Phrase</MockBtn>
          <MockBtn>Replay</MockBtn>
          <MockBtn>Show Answer</MockBtn>
        </>
      }>
        <strong className="text-white">▶ Play Phrase</strong>: generates and plays a modal phrase (560ms gap between notes). Shows "♪ Playing…" while active.<br/>
        <strong className="text-white">Replay</strong>: visible after first play.<br/>
        <strong className="text-white">Show Answer</strong>: reveals the correct mode without guessing. Only visible after playing and before answering.
      </Row>

      <Sub>Answer Grid</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>Ionian</MockBtn>
          <MockBtn>Dorian</MockBtn>
          <MockBtn>Phrygian</MockBtn>
          <MockBtn>Lydian</MockBtn>
          <MockBtn>Mixolydian</MockBtn>
          <MockBtn>Aeolian</MockBtn>
          <MockBtn>Locrian</MockBtn>
        </div>
      }>
        A grid of mode name buttons appears after a phrase plays. Click the mode you think it is.<br/>
        <span className="text-[#5cca5c]">Green border + text</span>: correct answer (always shown after answering).<br/>
        <span className="text-[#e06060]">Red border + text</span>: your wrong guess.<br/>
        Buttons are disabled and greyed out before playing or after answering.
      </Row>

      <Sub>Answer Feedback</Sub>
      <Row mock={
        <div className="bg-[#1a2a1a] border border-[#3a5a3a] rounded px-3 py-1.5">
          <span className="text-[10px] text-[#5cca5c]">✓ Dorian (Major)</span>
        </div>
      }>
        Feedback box appears after answering:<br/>
        <span className="text-[#5cca5c]">✓ ModeName (Family)</span> if correct.<br/>
        <span className="text-[#e06060]">✗ It was: ModeName (Family)</span> if wrong.
      </Row>
    </>
  );
}

function DrumPatternsContent() {
  return (
    <>
      <Heading>Drum Patterns</Heading>
      <P>
        A rhythmic pattern builder with two main modes: Ostinato and Accent Study.
      </P>

      <Sub>Mode Tabs</Sub>
      <Row mock={<MockToggle options={["Ostinato","Accent"]} active={0}/>}>
        Top-level toggle between the two drum pattern modes.
      </Row>

      <Sub>Ostinato Mode -- Grid Settings</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Grid</span>
          <MockSelect>16th</MockSelect>
        </>
      }>
        Grid subdivision type. Options include: 16th, 8th, quarter, etc.
        Determines how finely the beat is divided.
      </Row>

      <Sub>Ostinato Mode -- Drum Voices</Sub>
      <Row mock={
        <div className="flex gap-1">
          <MockBtn active color="#7173e6">O</MockBtn>
          <MockBtn active color="#e06060">S</MockBtn>
          <MockBtn active color="#7aaa7a">B</MockBtn>
          <MockBtn>HH</MockBtn>
          <MockBtn>G</MockBtn>
          <MockBtn>G=dbl</MockBtn>
        </div>
      }>
        Toggle buttons for each voice:<br/>
        <strong className="text-[#7173e6]">O (Ostinato)</strong>: main repeating pattern (hi-hat/ride).<br/>
        <strong className="text-[#e06060]">S (Snare)</strong>: snare drum hits.<br/>
        <strong className="text-[#7aaa7a]">B (Bass)</strong>: bass drum / kick.<br/>
        <strong className="text-white">HH (Hi-Hat)</strong>: hi-hat cymbal.<br/>
        <strong className="text-white">G (Ghost)</strong>: quiet snare ghost notes.<br/>
        <strong className="text-white">G=dbl</strong>: toggle ghost note double-stroke mode.
      </Row>

      <Sub>Ostinato Mode -- Permutation Controls</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Order</span>
          <MockInput value="2" w={36}/>
          <MockBtn>−</MockBtn>
          <MockBtn>+</MockBtn>
          <span className="text-[10px] text-[#888] ml-2">Limit</span>
          <MockInput value="∞" w={36}/>
        </>
      }>
        <strong className="text-white">Order</strong>: number of hits per permutation slot. +/− buttons to adjust.<br/>
        <strong className="text-white">Limit</strong>: max permutations (∞ for unlimited).
      </Row>

      <Sub>Ostinato Mode -- Measure Controls</Sub>
      <Row mock={
        <>
          <MockBtn>+ Add</MockBtn>
          <MockBtn>Replace</MockBtn>
          <MockBtn>Clear</MockBtn>
          <MockBtn>◀</MockBtn>
          <MockBtn>▶</MockBtn>
        </>
      }>
        <strong className="text-white">+ Add</strong>: adds a new measure.<br/>
        <strong className="text-white">Replace</strong>: replaces the selected measure.<br/>
        <strong className="text-white">Clear</strong>: clears all measures.<br/>
        <strong className="text-white">◀ / ▶</strong>: navigate between measures.
        Each measure card has a <strong className="text-white">×</strong> delete button.
      </Row>

      <Sub>Accent Study Mode</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Grid</span>
          <MockSelect>16th notes</MockSelect>
          <span className="text-[10px] text-[#888] ml-2">Beats</span>
          <MockToggle options={["1","2","3","4","5","6","7","8"]} active={3}/>
        </>
      }>
        <strong className="text-white">Grid</strong>: subdivision type dropdown.<br/>
        <strong className="text-white">Beats</strong>: how many beats per measure (1-8). Default: 4.
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Pattern</span>
          <MockToggle options={["musical","awkward","both"]} active={0}/>
        </>
      }>
        Pattern generation mode:<br/>
        <strong className="text-white">musical</strong>: common, natural groupings. Default.<br/>
        <strong className="text-white">awkward</strong>: unusual groupings that challenge coordination.<br/>
        <strong className="text-white">both</strong>: mix of both.
      </Row>

      <Row mock={
        <>
          <MockBtn active>Generate</MockBtn>
          <MockInput value="custom (e.g. 3-4-5-4)" w={160}/>
          <MockBtn>Apply</MockBtn>
        </>
      }>
        <strong className="text-white">Generate</strong>: creates a new accent grouping pattern.<br/>
        <strong className="text-white">Custom input</strong>: type your own grouping (e.g. "3-4-5-4") and click Apply.
      </Row>

      <Sub>Accent Study -- Interpretation</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>accent-flam</MockBtn>
          <MockBtn>accent-double</MockBtn>
          <MockBtn>tap-buzz</MockBtn>
          <MockBtn>tap-flam</MockBtn>
          <span className="text-[10px] text-[#555]">…</span>
        </div>
      }>
        Toggle buttons for accent and tap interpretations. Accent options change how accented notes
        are played (flam, double, etc.). Tap options change how non-accented notes are played.
      </Row>

      <Sub>Accent Study -- Sticking</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-2">
          <MockCheck label="Odd Sticking"/>
          <MockCheck label="Even Sticking"/>
          <MockCheck label="Paradiddle"/>
          <MockCheck label="Single Strokes"/>
          <MockToggle options={["R Lead","L Lead"]} active={0}/>
        </div>
      }>
        Checkboxes for sticking patterns. Paradiddle is mutually exclusive with others.
        R Lead / L Lead: which hand starts.
      </Row>

      <Sub>Accent Study -- Orchestration</Sub>
      <Row mock={
        <div className="flex gap-1">
          <MockToggle options={["none","replace-accents","replace-taps"]} active={0}/>
          <span className="ml-2"/>
          <MockToggle options={["snare","snare-tom","full-kit"]} active={0}/>
        </div>
      }>
        <strong className="text-white">Bass</strong>: none, replace-accents (bass drum on accents), replace-taps (bass on taps).<br/>
        <strong className="text-white">Orchestration</strong>: snare only, snare + tom, or full kit.
      </Row>

      <Sub>Accent Study -- Save & Rating</Sub>
      <Row mock={
        <>
          <span className="text-[10px]" style={{color:"#c8aa50"}}>★★★☆☆</span>
          <MockInput value="Study name…" w={80}/>
          <MockBtn>Save</MockBtn>
          <MockBtn>Load</MockBtn>
        </>
      }>
        <strong className="text-[#c8aa50]">Rating stars (1-5)</strong>: click to rate difficulty/importance.
        Colors: 1=red, 2=orange, 3=yellow, 4=green, 5=blue.<br/>
        <strong className="text-white">Name input + Save</strong>: save the exercise with a name.<br/>
        <strong className="text-white">Load</strong>: load from saved exercises.
      </Row>
    </>
  );
}

function ChordChartContent() {
  return (
    <>
      <Heading>Chord Chart</Heading>
      <P>
        A chart builder for documenting chord progressions bar by bar.
      </P>

      <Sub>Bar Count</Sub>
      <Row mock={
        <>
          <MockToggle options={["1","2","4","8","16"]} active={2}/>
          <span className="ml-2"/>
          <MockInput value="4" w={40}/>
          <MockBtn>Set</MockBtn>
        </>
      }>
        Quick-select buttons: 1, 2, 4, 8, 16 bars. Or type a custom count (1-64) and click Set. Default: 4.
      </Row>

      <Sub>Per-Bar Time Signature</Sub>
      <Row mock={
        <>
          <MockSelect>4/4</MockSelect>
          <MockBtn>↑ copy prev</MockBtn>
          <MockBtn>→ all after</MockBtn>
        </>
      }>
        <strong className="text-white">Time signature dropdown</strong>: presets 4/4, 3/4, 7/8, Custom. Default: 4/4.<br/>
        When "Custom" is selected, two extra inputs appear:<br/>
        &nbsp;&nbsp;Custom signature text (e.g. "5/8") and custom beat count (1-32).<br/>
        <strong className="text-white">↑ copy prev</strong>: copies time signature from bar above.<br/>
        <strong className="text-white">→ all after</strong>: applies this bar's time signature to all following bars.
      </Row>

      <Sub>Chord Entry</Sub>
      <Row mock={
        <div className="flex gap-1">
          <MockInput value="Cmaj7" w={56}/>
          <MockInput value="—" w={56}/>
          <MockInput value="Dm7" w={56}/>
          <MockInput value="—" w={56}/>
        </div>
      }>
        Text inputs for each beat in each bar. Type chord names (e.g. "Cmaj7", "F#m", "Bb7").
        Placeholder is "—" for empty beats.
      </Row>

      <Sub>Chart Management</Sub>
      <Row mock={
        <>
          <MockInput value="Chart title…" w={100}/>
          <MockBtn>Save Chart</MockBtn>
          <MockBtn>↓ Export</MockBtn>
        </>
      }>
        <strong className="text-white">Title input</strong>: name your chart.<br/>
        <strong className="text-white">Save Chart</strong>: saves to local storage. Saved charts appear in a list with load and delete (×) buttons.<br/>
        <strong className="text-white">↓ Export</strong>: opens export dialog for MusicXML or PDF output.
      </Row>

      <Sub>Practice Log</Sub>
      <Row mock={
        <MockSelect>Working On</MockSelect>
      }>
        Log status dropdown: "Working On" or "Finished". Used when saving to the practice log.
      </Row>
    </>
  );
}

function KonnakolContent() {
  return (
    <>
      <Heading>Solkattu</Heading>
      <P>
        South Indian vocal percussion. Speak rhythmic patterns using specific syllables.
      </P>

      <Sub>Panel Tabs</Sub>
      <Row mock={<MockToggle options={["Subdivisions","Cycles"]} active={0}/>}>
        Switches between the two main panels. Default: Subdivisions.
      </Row>

      <Sub>Subdivisions Panel -- Subdivision Selection</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockToggle options={["2","3","4","5","6","7","8","9","12","16"]} active={2}/>
        </div>
      }>
        Buttons to select beat subdivision. Default: 4 (Ta Ka Di Mi). Each number represents
        how many syllables fit into one beat.
      </Row>

      <Sub>Subdivisions Panel -- Beat Count Filter</Sub>
      <Row mock={
        <div className="flex gap-1">
          <MockBtn active>ALL</MockBtn>
          <MockToggle options={["2","3","4","5","6","7","8"]} active={-1}/>
        </div>
      }>
        Filter by number of beats. Default: ALL (shows all patterns).
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Beats</span>
          <MockInput value="4" w={40}/>
        </>
      }>
        Number input for beat count (1-32). Default: 4.
      </Row>

      <Sub>Subdivisions Panel -- Tuplet & Generation</Sub>
      <Row mock={
        <>
          <MockBtn>tuplet</MockBtn>
          <MockBtn active>Generate</MockBtn>
        </>
      }>
        <strong className="text-white">tuplet</strong>: toggles tuplet display mode.<br/>
        <strong className="text-white">Generate</strong>: creates a konnakol pattern from selected items.
      </Row>

      <Sub>Subdivisions Panel -- Note Modifications</Sub>
      <Row mock={
        <div className="flex gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#7aaa7a] text-[#7aaa7a]">Ta</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#c8aa50] text-[#c8aa50]">~</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#888] text-[#888]">r</span>
        </div>
      }>
        Per-syllable toggle buttons:<br/>
        <span className="text-[#7aaa7a]">Green</span>: normal syllable.<br/>
        <span className="text-[#c8aa50]">Gold (~)</span>: tie (sustain from previous).<br/>
        <span className="text-[#888]">Grey (r)</span>: rest (silence).<br/>
        <strong className="text-white">Random Modifications</strong> button: randomly applies ties and rests.
      </Row>

      <Sub>Subdivisions Panel -- Mixed Group Presets</Sub>
      <Row mock={
        <>
          <MockInput value="e.g. 1+2+2 or 4 4 4 4" w={180}/>
          <span className="text-[10px] text-[#888] ml-2">Pulses</span>
          <MockBtn>−</MockBtn>
          <MockInput value="16" w={36}/>
          <MockBtn>+</MockBtn>
        </>
      }>
        <strong className="text-white">Custom formula</strong>: type grouping patterns (e.g. "1+2+2" or "4 4 4 4"). Leave blank to use pulse count.<br/>
        <strong className="text-white">Pulses</strong>: total pulse count with −/+ buttons (2-32). Default: 16.
      </Row>

      <Sub>Cycles Panel</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>3:2</MockBtn>
          <MockBtn>4:3</MockBtn>
          <MockBtn>5:4</MockBtn>
          <MockBtn>5:3</MockBtn>
          <span className="text-[10px] text-[#555]">…</span>
        </div>
      }>
        Cycle ratio buttons. Select a ratio to see its description: group size, repetitions, total pulses.
      </Row>

      <Row mock={
        <>
          <MockBtn active>Generate 3:2 Cycle</MockBtn>
          <MockBtn>Random Modifications</MockBtn>
        </>
      }>
        <strong className="text-white">Generate</strong>: creates the selected cycle pattern (disabled if no ratio selected).<br/>
        <strong className="text-white">Random Modifications</strong>: randomly applies note changes.
      </Row>

      <Sub>Export & Practice Log</Sub>
      <Row mock={
        <>
          <MockBtn>↓ Export</MockBtn>
          <span className="text-[10px] text-[#888] ml-2">Source</span>
          <MockSelect>Subdivisions</MockSelect>
        </>
      }>
        <strong className="text-white">↓ Export</strong>: exports as MusicXML.<br/>
        <strong className="text-white">Practice log source</strong>: dropdown to choose what to save: Subdivisions, Mixed Groups, or Cycles.
      </Row>
    </>
  );
}

function TranscriptionsContent() {
  return (
    <>
      <Heading>Quick Transcriptions</Heading>
      <P>
        A notation entry tool for writing down music. Enter notes staff by staff, measure by measure.
      </P>

      <Sub>Project Management</Sub>
      <Row mock={
        <>
          <MockBtn>New Project</MockBtn>
          <MockBtn>Load</MockBtn>
          <MockBtn>Save</MockBtn>
        </>
      }>
        <strong className="text-white">New Project</strong>: opens setup dialog (title, clef, time signature, key, bar count).<br/>
        <strong className="text-white">Load / Save</strong>: persist and restore transcription projects locally.
      </Row>

      <Sub>Setup Dialog (New Project)</Sub>
      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Clef</span>
          <MockSelect>treble</MockSelect>
          <span className="text-[10px] text-[#888] ml-2">Key</span>
          <MockSelect>0 (C major)</MockSelect>
        </>
      }>
        <strong className="text-white">Clef</strong>: treble or bass.<br/>
        <strong className="text-white">Key Signature</strong>: -7 (7 flats) through +7 (7 sharps). 0 = C major / A minor.
      </Row>

      <Row mock={
        <>
          <span className="text-[10px] text-[#888]">Time</span>
          <MockSelect>4</MockSelect>
          <span className="text-[10px] text-[#888]">/</span>
          <MockSelect>4</MockSelect>
          <span className="text-[10px] text-[#888] ml-2">Bars</span>
          <MockInput value="8" w={40}/>
        </>
      }>
        <strong className="text-white">Time signature</strong>: numerator (1-12) / denominator (2, 4, 8, 16).<br/>
        <strong className="text-white">Bars</strong>: number of measures (1-64).
      </Row>

      <Sub>Duration Selection</Sub>
      <Row mock={
        <div className="flex gap-0.5">
          <MockToggle options={["W","H","Q","8","16","32"]} active={2}/>
          <span className="ml-1"/>
          <MockBtn>·</MockBtn>
        </div>
      }>
        Note duration buttons: Whole, Half, Quarter (default), Eighth, 16th, 32nd.<br/>
        <strong className="text-white">· (dot)</strong>: makes the note dotted (1.5× duration).
      </Row>

      <Sub>Accidentals</Sub>
      <Row mock={
        <div className="flex gap-0.5">
          <MockBtn>♯</MockBtn>
          <MockBtn>♮</MockBtn>
          <MockBtn>♭</MockBtn>
        </div>
      }>
        Sharp, natural, flat. Applied to the next note you enter or to the currently selected note.
      </Row>

      <Sub>Toolbar Buttons</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>R</MockBtn>
          <MockBtn>← tie</MockBtn>
          <MockBtn>→ tie</MockBtn>
          <MockBtn>Undo</MockBtn>
          <MockBtn>Fill Rests</MockBtn>
        </div>
      }>
        <strong className="text-white">R</strong>: toggle rest mode (inserts silence instead of a note).<br/>
        <strong className="text-white">← tie / → tie</strong>: tie the selected note to/from the previous/next note.<br/>
        <strong className="text-white">Undo</strong>: undo last action.<br/>
        <strong className="text-white">Fill Rests</strong>: fills remaining space in the measure with rests.
      </Row>

      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>↓ MusicXML</MockBtn>
          <MockBtn>↓ PDF</MockBtn>
          <MockBtn>⊡ X-Ray</MockBtn>
          <MockBtn>▶ YouTube</MockBtn>
          <MockBtn>⚙ Setup</MockBtn>
        </div>
      }>
        <strong className="text-white">↓ MusicXML</strong>: export for notation software (MuseScore, Sibelius, Finale).<br/>
        <strong className="text-white">↓ PDF</strong>: export print-ready PDF.<br/>
        <strong className="text-white">⊡ X-Ray</strong>: toggle beat grid overlay for visual alignment.<br/>
        <strong className="text-white">▶ YouTube</strong>: toggle YouTube video panel. Link a video URL to reference while transcribing.<br/>
        <strong className="text-white">⚙ Setup</strong>: reopen the project setup dialog.
      </Row>

      <Sub>Note Interaction</Sub>
      <Row mock={
        <div className="bg-[#141414] border border-[#2a2a2a] rounded px-3 py-1.5">
          <span className="text-[10px] text-[#888]">Click staff to place note · Click note to select · Drag to multi-select · ◀/▶ move · Del to remove</span>
        </div>
      }>
        <strong className="text-white">Click on the staff</strong>: places a note at that pitch and position.<br/>
        <strong className="text-white">Click a note</strong>: selects it. Shows pitch, duration, accidental controls.<br/>
        <strong className="text-white">Drag rectangle</strong>: multi-select. Shows bulk duration change and delete.<br/>
        <strong className="text-white">◀ / ▶ arrows</strong>: move selected note left/right.<br/>
        <strong className="text-white">Ghost notes</strong>: shown in parentheses. <strong className="text-white">Chords</strong>: multiple notes at same position.
      </Row>
    </>
  );
}

function PhraseDecompContent() {
  return (
    <>
      <Heading>Phrase Decomposition</Heading>
      <P>
        Analyze and transform musical phrases using reinterpretation techniques. Break a phrase apart,
        change it, and reassemble it.
      </P>

      <Sub>Phrase Input</Sub>
      <Row mock={
        <>
          <MockBtn>Create Demo Phrase</MockBtn>
          <MockBtn>Load C Scale (2 bars)</MockBtn>
          <MockBtn>Clear</MockBtn>
        </>
      }>
        <strong className="text-white">Create Demo Phrase</strong>: loads a sample phrase to experiment with.<br/>
        <strong className="text-white">Load C Scale</strong>: loads a simple 2-bar C scale.<br/>
        <strong className="text-white">Clear</strong>: removes the current phrase.
        You can also import phrases from the Quick Transcriptions mode (ALT+click a bar).
      </Row>

      <Sub>Chord Management</Sub>
      <Row mock={
        <>
          <MockInput value="Cmaj7" w={64}/>
          <MockBtn>Add</MockBtn>
          <MockBtn>Edit</MockBtn>
          <MockBtn>Del</MockBtn>
        </>
      }>
        Add chord symbols above the phrase. Type chord name (e.g. "Cmaj7") and click Add.
        Click a chord to Edit or Del it.
      </Row>

      <Sub>Display Options</Sub>
      <Row mock={
        <>
          <MockCheck label="Solfege"/>
          <MockCheck label="Tensions"/>
        </>
      }>
        <strong className="text-white">Solfege</strong>: show solfege syllable labels on notes.<br/>
        <strong className="text-white">Tensions</strong>: show tension analysis. When enabled, tension select buttons appear.
      </Row>

      <Sub>Rhythm Subdivision</Sub>
      <Row mock={
        <MockToggle options={["16th","8th","qtr","half","whole"]} active={1}/>
      }>
        Sets the rhythmic resolution for transformations. Default: eighth.
      </Row>

      <Sub>PITCH Transformations</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>Diatonic transposition</MockBtn>
          <MockBtn>Chromatic transposition</MockBtn>
          <MockBtn>Sequencing</MockBtn>
          <MockBtn>Interval transformation</MockBtn>
          <MockBtn>Contour preservation</MockBtn>
        </div>
      }>
        Each button generates a pitch-transformed variation of your phrase.<br/>
        <strong className="text-white">Diatonic</strong>: shift within the key.<br/>
        <strong className="text-white">Chromatic</strong>: shift by exact half-steps.<br/>
        <strong className="text-white">Sequencing</strong>: repeat the shape on successive scale degrees.
        Sub-option: <MockToggle options={["scale","arp","random"]} active={0}/><br/>
        <strong className="text-white">Interval transformation</strong>: expand/compress intervals.
        Sub-options: <MockToggle options={["scale","chromatic"]} active={0}/> and <MockToggle options={["1x","2x","3x"]} active={0}/><br/>
        <strong className="text-white">Contour preservation</strong>: keep up/down shape, change exact notes.
      </Row>

      <Sub>HARMONY Transformations</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>Scale reinterpretation</MockBtn>
          <MockBtn>Chord tone shifting</MockBtn>
          <MockBtn>Reharmonization</MockBtn>
        </div>
      }>
        <strong className="text-white">Scale reinterpretation</strong>: same notes in a different scale context.<br/>
        <strong className="text-white">Chord tone shifting</strong>: adjust notes to fit new chords.<br/>
        <strong className="text-white">Reharmonization</strong>: new chords under the same melody. Has sub-mode buttons with color coding.
      </Row>

      <Sub>ORNAMENT Transformations</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>Insert passing tones</MockBtn>
          <MockBtn>Approach notes</MockBtn>
        </div>
      }>
        <strong className="text-white">Insert passing tones</strong>: fill gaps with stepwise connections.
        Sub-option: <MockToggle options={["above","below","between"]} active={0}/><br/>
        <strong className="text-white">Approach notes</strong>: bebop-style chromatic approaches.
        Sub-option: <MockToggle options={["above","below","chromatic","half-step"]} active={0}/>
      </Row>

      <Sub>STRUCTURE Transformations</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>Simplify</MockBtn>
          <MockBtn>Fragment</MockBtn>
          <MockBtn>Rotate / Reverse</MockBtn>
          <MockBtn>Register shift</MockBtn>
          <MockBtn>Density change</MockBtn>
        </div>
      }>
        <strong className="text-white">Simplify</strong>: strip ornaments to find the skeleton.<br/>
        <strong className="text-white">Fragment</strong>: extract a portion. Sub-option: <MockToggle options={["ascending","descending","peak","valley"]} active={0}/><br/>
        <strong className="text-white">Rotate / Reverse</strong>: start from different point or play backwards.<br/>
        <strong className="text-white">Register shift</strong>: move octaves. Sub-option: <MockToggle options={["lower","raise","alternate"]} active={0}/><br/>
        <strong className="text-white">Density change</strong>: add/remove notes. Sub-option: <MockToggle options={["sparse","medium","dense"]} active={0}/>
      </Row>

      <Sub>RHYTHM Transformations</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn>Grouping / accentuation</MockBtn>
          <MockBtn>Target beat shifting</MockBtn>
        </div>
      }>
        <strong className="text-white">Grouping</strong>: regroup into different metric patterns. Has sub-mode buttons with color coding.
        You can click individual notes to toggle accent marks.<br/>
        <strong className="text-white">Target beat shifting</strong>: move phrase so key note lands on a different beat.
      </Row>

      <Sub>ADVANCED</Sub>
      <Row mock={<MockBtn>Motivic development</MockBtn>}>
        Combines multiple transformations to evolve a phrase through a series of related variations.
        Sub-option: <MockToggle options={["reverse","retrograde","…"]} active={-1}/>
      </Row>

      <Sub>PRESETS</Sub>
      <Row mock={
        <div className="flex flex-wrap gap-1">
          <MockBtn active color="#c8aa50">Bebop</MockBtn>
          <MockBtn color="#c8aa50">Modal Jazz</MockBtn>
          <MockBtn color="#c8aa50">Classical</MockBtn>
          <span className="text-[10px] text-[#555]">…</span>
        </div>
      }>
        Style presets (gold-colored buttons). Pre-configured combinations of operations for common
        transformation workflows. Click to apply a preset's full chain of transformations.
      </Row>

      <Sub>Variation Controls</Sub>
      <Row mock={
        <>
          <MockBtn active>Generate</MockBtn>
          <MockBtn>Reset to Original</MockBtn>
          <MockCheck label="Random Permutation"/>
        </>
      }>
        <strong className="text-white">Generate</strong>: creates the variation using selected transformation.<br/>
        <strong className="text-white">Reset to Original</strong>: reverts to the unmodified phrase.<br/>
        <strong className="text-white">Random Permutation</strong>: when checked, adds randomness to the transformation.
      </Row>

      <Sub>Bar Locking</Sub>
      <Row mock={
        <div className="flex gap-1">
          <span className="text-[10px] px-2 py-0.5 rounded border border-[#2a2a2a] bg-[#1a1a1a] text-[#888]">Bar 1</span>
          <span className="text-[10px] px-2 py-0.5 rounded border border-[#c8aa50] bg-[#1a1a0e] text-[#c8aa50]">Bar 2 🔒</span>
        </div>
      }>
        Click bar labels to lock them. Locked bars (gold border + lock icon) are excluded from transformations,
        keeping their content unchanged.
      </Row>
    </>
  );
}

function PracticeLogContent() {
  return (
    <>
      <Heading>Practice Log & Stats</Heading>
      <P>Click the Practice Log button in the top-right header to open it.</P>

      <Sub>Calendar View</Sub>
      <Row mock={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <MockBtn>‹</MockBtn>
            <span className="text-[10px] text-white">March 2026</span>
            <MockBtn>›</MockBtn>
            <MockBtn>Today</MockBtn>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {["S","M","T","W","T","F","S"].map((d,i) => (
              <span key={i} className="text-[8px] text-[#555] text-center w-5">{d}</span>
            ))}
            {[1,2,3,4,5,6,7].map(n => (
              <span key={n} className={`text-[8px] text-center w-5 h-5 flex items-center justify-center rounded ${n===3?"bg-[#7173e6]/20 text-[#7173e6]":"text-[#888]"}`}>
                {n}{n===3 && <span className="text-[4px] text-[#7173e6]">•</span>}
              </span>
            ))}
          </div>
        </div>
      }>
        Monthly calendar. Dots indicate days with saved sessions. Click any date to see entries.
        <strong className="text-white"> ‹ / ›</strong>: navigate months.
        <strong className="text-white"> Today</strong>: jump to current month (only visible when viewing another month).
        Bottom shows: days active and total entries for the month.
      </Row>

      <Sub>Session Entry Cards</Sub>
      <Row mock={
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 flex flex-col gap-1 w-60">
          <div className="flex items-center gap-2">
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#7173e6]/20 text-[#7173e6]">ear-trainer</span>
            <span className="text-[8px] text-[#555]">14:32</span>
            <span className="text-[8px] ml-auto" style={{color:"#c8aa50"}}>★★★☆☆</span>
          </div>
          <span className="text-[9px] text-[#888]">Spatial Audiation · Intervals</span>
          <div className="flex gap-1 mt-1">
            <MockBtn>↩ Load Back In</MockBtn>
            <MockBtn active color="#3a1a1a">×</MockBtn>
          </div>
        </div>
      }>
        Each saved entry shows:<br/>
        <strong className="text-[#7173e6]">Mode badge</strong>: which section (ear-trainer, drum-ostinato, konnakol, etc.).<br/>
        <strong className="text-white">Timestamp</strong>: when it was saved.<br/>
        <strong className="text-[#c8aa50]">Rating stars</strong> (1-5): color varies (1=red, 2=orange, 3=gold, 4=green, 5=blue).<br/>
        <strong className="text-white">Preview</strong>: text description or screenshot thumbnail.<br/>
        <strong className="text-white">↩ Load Back In</strong>: restores all settings from this session.<br/>
        <strong className="text-white">× Delete</strong>: double-click to confirm removal. An undo button appears briefly.
      </Row>

      <Sub>Statistics (Stats Modal)</Sub>
      <Row mock={<MockToggle options={["Today","Week","Month","Options"]} active={0}/>}>
        Stats modal has 4 views accessible via tabs at the top.
      </Row>

      <Row mock={
        <div className="bg-[#141414] border border-[#2a2a2a] rounded px-3 py-1.5 flex items-center gap-3">
          <span className="text-[10px] text-[#5cca5c]">✓ 24</span>
          <span className="text-[10px] text-[#e06060]">✗ 6</span>
          <span className="text-[10px] text-[#888]">80%</span>
          <span className="relative inline-block w-20 h-1.5 rounded bg-[#333]">
            <span className="absolute left-0 top-0 h-full rounded bg-[#5cca5c]" style={{width:"80%"}} />
          </span>
        </div>
      }>
        <strong className="text-white">Today / Week / Month</strong>: shows correct, wrong, accuracy with a progress bar per option.
        Each row has <strong className="text-white">−✓, −✗, ✕</strong> buttons to adjust or clear individual entries.<br/>
        <strong className="text-white">Week view</strong>: clickable day rows. Bar colors: green (≥70%), yellow (≥50%), red (&lt;50%).<br/>
        <strong className="text-white">Month view</strong>: calendar grid with per-day correct/wrong counts.<br/>
        <strong className="text-white">Options view</strong>: all attempted options sorted by frequency with accuracy coloring.
      </Row>

      <Sub>Data Management (Settings Modal)</Sub>
      <Row mock={
        <>
          <MockBtn>↓ Export Data</MockBtn>
          <MockBtn>↑ Import Data</MockBtn>
        </>
      }>
        <strong className="text-white">Export Data</strong>: downloads all settings, stats, presets, and practice logs as a single JSON file.<br/>
        <strong className="text-white">Import Data</strong>: loads a previously exported JSON file. Refreshes the page after import.
      </Row>
    </>
  );
}

/* ── content map ──────────────────────────────────────────────────── */

const CONTENT: Record<DocSection, () => JSX.Element> = {
  overview: OverviewContent,
  "global-controls": GlobalControlsContent,
  intervals: IntervalsContent,
  chords: ChordsContent,
  melody: MelodyContent,
  jazz: JazzContent,
  patterns: PatternsContent,
  drone: DroneContent,
  modeid: ModeIdContent,
  drums: DrumPatternsContent,
  "chord-chart": ChordChartContent,
  konnakol: KonnakolContent,
  transcriptions: TranscriptionsContent,
  "phrase-decomp": PhraseDecompContent,
  "practice-log": PracticeLogContent,
};

/* ── main modal ───────────────────────────────────────────────────── */

export default function DocumentationModal({ onClose }: Props) {
  const [active, setActive] = useState<DocSection>("overview");

  const Content = CONTENT[active];

  const groups: { label: string; items: typeof SECTIONS }[] = [];
  let lastGroup = "";
  for (const s of SECTIONS) {
    if (s.group !== lastGroup) {
      groups.push({ label: s.group, items: [] });
      lastGroup = s.group;
    }
    groups[groups.length - 1].items.push(s);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e1e] flex-shrink-0">
          <div className="flex items-center gap-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#7173e6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <h2 className="font-semibold text-sm text-white">Documentation</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#555] hover:text-white text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <nav className="w-48 flex-shrink-0 border-r border-[#1e1e1e] overflow-y-auto py-3 px-2">
            {groups.map((g) => (
              <div key={g.label} className="mb-3">
                <div className="text-[10px] font-bold text-[#555] uppercase tracking-widest px-2 mb-1">
                  {g.label}
                </div>
                {g.items.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setActive(s.key)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      active === s.key
                        ? "bg-[#7173e6]/15 text-[#7173e6] font-medium"
                        : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <Content />
          </div>
        </div>
      </div>
    </div>
  );
}
