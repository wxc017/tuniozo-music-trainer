"""
Verify folk song transcriptions by generating MIDI files.
Listen to each one to confirm the melody is correct.

Also generates an HTML player page for quick A/B comparison.
"""

import json
import os
from pathlib import Path

# pip install midiutil
try:
    from midiutil import MIDIFile
except ImportError:
    print("Installing midiutil...")
    os.system("pip install midiutil")
    from midiutil import MIDIFile

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "folk_songs_output" / "folk_songs_degrees.json"
MIDI_DIR = SCRIPT_DIR / "folk_songs_output" / "midi"
HTML_PATH = SCRIPT_DIR / "folk_songs_output" / "verify.html"

MIDI_DIR.mkdir(exist_ok=True)

# Scale degree to semitones from tonic (chromatic)
DEGREE_TO_SEMITONES = {
    "1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "#3": 5,
    "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8, "b6": 8,
    "6": 9, "#6": 10, "b7": 10, "7": 11,
}

def degree_to_midi(degree: str, octave_offset: int, tonic_midi: int = 60) -> int:
    """Convert scale degree + octave to MIDI note number."""
    semitones = DEGREE_TO_SEMITONES.get(degree, 0)
    return tonic_midi + semitones + (octave_offset * 12)

def song_to_midi(song: dict, filepath: Path):
    """Convert a song's scale degrees to a MIDI file."""
    midi = MIDIFile(1)
    track = 0
    channel = 0
    tempo = 120
    volume = 100

    midi.addTempo(track, 0, tempo)
    midi.addProgramChange(track, channel, 0, 0)  # Piano

    # Determine tonic MIDI based on key
    key_str = song.get("key_sig", "C major")
    tonic_name = key_str.split()[0] if key_str else "C"
    tonic_map = {"C": 60, "D": 62, "E": 64, "F": 65, "G": 67, "A": 69, "B": 71,
                 "C#": 61, "Db": 61, "D#": 63, "Eb": 63, "F#": 66, "Gb": 66,
                 "G#": 68, "Ab": 68, "A#": 70, "Bb": 70, "B-": 70}
    tonic_midi = tonic_map.get(tonic_name, 60)

    time = 0.0  # in quarter notes
    for event in song.get("scale_degrees", []):
        dur = event.get("quarterLength", 1.0)
        if event.get("is_rest"):
            time += dur
            continue
        degree = event.get("scale_degree", "1")
        octave = event.get("octave_offset", 0)
        pitch = degree_to_midi(degree, octave, tonic_midi)
        # Clamp to valid MIDI range
        pitch = max(0, min(127, pitch))
        midi.addNote(track, channel, pitch, time, dur * 0.9, volume)
        time += dur

    with open(filepath, "wb") as f:
        midi.writeFile(f)

def generate_html(songs: list):
    """Generate an HTML page with embedded MIDI players for verification."""
    rows = []
    for s in songs:
        name = s.get("name", "?")
        safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in name)
        midi_file = f"midi/{safe_name}.mid"
        key = s.get("key_sig", "?")
        time_sig = s.get("time_sig", "?")
        start = s.get("starting_note", "?")
        tonality = s.get("tonality", "?")
        n_notes = len(s.get("scale_degrees", []))
        contour = s.get("melody_contour", "")[:80]

        rows.append(f"""
        <tr>
          <td class="name">{name}</td>
          <td>{key}</td>
          <td>{time_sig}</td>
          <td>{tonality}</td>
          <td>{start}</td>
          <td>{n_notes}</td>
          <td class="contour">{contour}</td>
          <td>
            <button onclick="playMidi('{midi_file}', this)">&#9654; Play</button>
            <button onclick="stopMidi()">&#9632; Stop</button>
            <span class="status"></span>
          </td>
          <td>
            <button class="ok" onclick="mark(this,'ok')">OK</button>
            <button class="bad" onclick="mark(this,'bad')">Wrong</button>
            <span class="verdict"></span>
          </td>
        </tr>""")

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Folk Song Verification</title>
<style>
  body {{ background: #111; color: #ccc; font-family: monospace; padding: 20px; }}
  h1 {{ color: #e0a040; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th {{ background: #222; color: #e0a040; padding: 8px; text-align: left; position: sticky; top: 0; }}
  td {{ padding: 6px 8px; border-bottom: 1px solid #222; }}
  tr:hover {{ background: #1a1a1a; }}
  .name {{ color: #aaf; font-weight: bold; }}
  .contour {{ color: #888; font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  button {{ padding: 4px 10px; border: 1px solid #444; background: #222; color: #ccc; cursor: pointer; border-radius: 3px; margin: 1px; }}
  button:hover {{ background: #333; }}
  button.ok {{ border-color: #5a5; color: #5a5; }}
  button.bad {{ border-color: #a55; color: #a55; }}
  .verdict {{ margin-left: 5px; font-weight: bold; }}
  .status {{ font-size: 11px; color: #888; }}
  .marked-ok {{ background: #1a2a1a !important; }}
  .marked-bad {{ background: #2a1a1a !important; }}
  #summary {{ margin: 20px 0; padding: 10px; background: #1a1a1a; border: 1px solid #333; border-radius: 5px; }}
</style>
</head>
<body>
<h1>Folk Song Verification ({len(songs)} songs)</h1>
<p>Play each MIDI file and mark it as OK or Wrong. Use a reference (YouTube, sheet music) to compare.</p>
<div id="summary">
  <span id="okCount">0</span> OK &nbsp;|&nbsp; <span id="badCount">0</span> Wrong &nbsp;|&nbsp; <span id="remaining">{len(songs)}</span> remaining
</div>
<table>
<thead>
<tr><th>Song</th><th>Key</th><th>Time</th><th>Mode</th><th>Start</th><th>Notes</th><th>Contour</th><th>Listen</th><th>Verify</th></tr>
</thead>
<tbody>
{"".join(rows)}
</tbody>
</table>

<script src="https://cdn.jsdelivr.net/npm/midi-player-js@2.0.16/browser/midiplayer.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js"></script>
<script>
let audioCtx, instrument, currentPlayer;
let okCount = 0, badCount = 0;

async function ensureAudio() {{
  if (!audioCtx) {{
    audioCtx = new AudioContext();
    instrument = await Soundfont.instrument(audioCtx, 'acoustic_grand_piano');
  }}
}}

async function playMidi(file, btn) {{
  await ensureAudio();
  stopMidi();
  const statusEl = btn.parentElement.querySelector('.status');
  statusEl.textContent = 'loading...';

  try {{
    const resp = await fetch(file);
    const buf = await resp.arrayBuffer();
    const arr = new Uint8Array(buf);

    currentPlayer = new MidiPlayer.Player(function(event) {{
      if (event.name === 'Note on' && event.velocity > 0) {{
        instrument.play(event.noteNumber, audioCtx.currentTime, {{ gain: event.velocity / 127 * 2, duration: 0.5 }});
      }}
    }});
    currentPlayer.loadArrayBuffer(arr);
    currentPlayer.play();
    statusEl.textContent = 'playing';
    currentPlayer.on('endOfFile', () => {{ statusEl.textContent = 'done'; }});
  }} catch(e) {{
    statusEl.textContent = 'error: ' + e.message;
  }}
}}

function stopMidi() {{
  if (currentPlayer) {{ currentPlayer.stop(); currentPlayer = null; }}
}}

function mark(btn, verdict) {{
  const row = btn.closest('tr');
  const verdictEl = row.querySelector('.verdict');
  // Remove previous
  if (row.classList.contains('marked-ok')) {{ okCount--; }}
  if (row.classList.contains('marked-bad')) {{ badCount--; }}
  row.classList.remove('marked-ok', 'marked-bad');

  if (verdict === 'ok') {{
    row.classList.add('marked-ok');
    verdictEl.textContent = 'OK';
    verdictEl.style.color = '#5a5';
    okCount++;
  }} else {{
    row.classList.add('marked-bad');
    verdictEl.textContent = 'WRONG';
    verdictEl.style.color = '#a55';
    badCount++;
  }}
  document.getElementById('okCount').textContent = okCount;
  document.getElementById('badCount').textContent = badCount;
  document.getElementById('remaining').textContent = {len(songs)} - okCount - badCount;
}}
</script>
</body>
</html>"""
    return html


def main():
    with open(INPUT, encoding="utf-8") as f:
        songs = json.load(f)

    print(f"Loaded {len(songs)} songs")

    for s in songs:
        name = s.get("name", "unknown")
        safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in name)
        midi_path = MIDI_DIR / f"{safe_name}.mid"
        song_to_midi(s, midi_path)
        n = len(s.get("scale_degrees", []))
        print(f"  {name:<45s} -> {midi_path.name} ({n} notes)")

    # Generate HTML verification page
    html = generate_html(songs)
    HTML_PATH.write_text(html, encoding="utf-8")
    print(f"\nMIDI files: {MIDI_DIR}")
    print(f"Verification page: {HTML_PATH}")
    print(f"\nOpen {HTML_PATH} in a browser to listen and verify each song.")


if __name__ == "__main__":
    main()
