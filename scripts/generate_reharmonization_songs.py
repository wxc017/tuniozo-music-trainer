"""
Generate the FOLK_SONGS array for ReharmonizationMode.tsx
from the folk song JSON data.
Converts flat note lists into bar-grouped SongBar[] format.
"""
import json, re, os
from pathlib import Path
from collections import defaultdict
from difflib import SequenceMatcher

SCRIPT_DIR = Path(__file__).parent
JSON_PATH = SCRIPT_DIR / "folk_songs_output" / "folk_songs_degrees.json"
CSV_PATH = Path(os.path.expanduser("~/Downloads/Folk songs spreadsheet - Sheet1.csv"))
OUTPUT = SCRIPT_DIR.parent / "src" / "lib" / "folkSongData.ts"

with open(JSON_PATH, encoding="utf-8") as f:
    songs = json.load(f)

# Load CSV for grouping metadata
import csv
with open(CSV_PATH, encoding="utf-8") as f:
    rows = list(csv.reader(f))

lookup = {}
for row in rows[3:]:
    if len(row) < 11 or not row[1].strip():
        continue
    raw = row[1].strip()
    if raw in ("I IV V",):
        continue
    clean = re.split(r'\s*[\(\[]', raw)[0]
    clean = re.split(r'\s*-\s*[IViv]+', clean)[0].strip().strip(',')
    if not clean:
        continue
    start_solfege = ""
    m = re.search(r'\((\w+)\s+\S+\)', raw)
    if m:
        start_solfege = m.group(1)
    lookup[clean.lower()] = {
        "tonality": row[10].strip() if len(row) > 10 else "Major",
        "metre": row[5].strip() if len(row) > 5 else "Duple",
        "swing": row[6].strip() if len(row) > 6 else "Straight",
        "tonal_functions": row[11].strip() if len(row) > 11 else "",
        "tradition": row[2].strip() if len(row) > 2 else "",
        "start_solfege": start_solfege,
    }


def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def notes_to_bars(notes, time_sig):
    """Group flat notes into bars based on time signature."""
    # Parse time sig
    m = re.match(r'(\d+)/(\d+)', time_sig)
    if m:
        beats_per_bar = int(m.group(1))
        beat_unit = int(m.group(2))
        # quarterLength per bar
        bar_length = beats_per_bar * (4.0 / beat_unit)
    else:
        bar_length = 4.0

    bars = []
    current_bar = []
    bar_remaining = bar_length

    for n in notes:
        ql = n["quarterLength"]
        current_bar.append(n)
        bar_remaining -= ql
        if bar_remaining <= 0.01:  # bar complete
            bars.append(current_bar)
            current_bar = []
            bar_remaining = bar_length

    if current_bar:
        bars.append(current_bar)

    return bars


def degree_str_to_number(d):
    """Convert degree string like 'b3', '#4', '7' to integer + accidental."""
    acc = None
    if d.startswith("b"):
        acc = "b"
        num = int(d[1:])
    elif d.startswith("#"):
        acc = "#"
        num = int(d[1:])
    else:
        num = int(d)
    return num, acc


def bar_to_ts(bar_notes):
    """Convert a bar of notes to TypeScript MelodyBeat[] literal."""
    beats = []
    for n in bar_notes:
        if n["is_rest"]:
            # Represent rest as degree 0
            beats.append(f'{{degree:0,duration:{n["quarterLength"]}}}')
        else:
            num, acc = degree_str_to_number(n["scale_degree"])
            # Adjust degree for octave
            oct = n["octave_offset"]
            # Keep degree 1-7, use octave to shift
            if oct > 0:
                num += 7 * oct
            elif oct < 0:
                num += 7 * oct  # negative = below

            acc_str = f',accidental:"{acc}"' if acc else ""
            beats.append(f'{{degree:{num},duration:{n["quarterLength"]}{acc_str}}}')
    return "[" + ",".join(beats) + "]"


# Build the TS file
lines = []
lines.append("// Auto-generated folk song data for ReharmonizationMode")
lines.append("// Organization: Tonality > Metre > Swing")
lines.append('import type { FolkSong, SongBar, MelodyBeat } from "@/components/ReharmonizationMode";')
lines.append("")

# Group songs
groups = defaultdict(list)
for s in songs:
    # Find CSV metadata
    name = s["name"].lower()
    best_match = None
    best_score = 0
    for csv_name, meta in lookup.items():
        score = SequenceMatcher(None, name, csv_name).ratio()
        if score > best_score and score > 0.5:
            best_score = score
            best_match = meta
    if best_match:
        s["_tonality"] = best_match["tonality"]
        s["_metre"] = best_match["metre"]
        s["_swing"] = best_match["swing"]
        s["_tonal_functions"] = best_match["tonal_functions"]
        s["_tradition"] = best_match["tradition"]
    else:
        s["_tonality"] = s.get("tonality", "Major")
        s["_metre"] = s.get("metre", "Duple")
        s["_swing"] = s.get("swing", "Straight")
        s["_tonal_functions"] = ""
        s["_tradition"] = s.get("tradition", "")

    key = (s["_tonality"], s["_metre"], s["_swing"])
    groups[key].append(s)

TONALITY_ORDER = [
    "Major", "Major pentatonic", "Minor", "Minor pentatonic", "Minor, full",
    "Dorian", "Dorian/aeolian", "Mixolydian", "Aeolian", "Phrygian",
    "Phrygian Dominant", "Lydian", "Hijaz", "Hijaz-Nahawand", "Locrian", "Bayati",
]

lines.append("export const FOLK_SONG_LIBRARY: FolkSong[] = [")

song_count = 0
group_info = []
for tonality in TONALITY_ORDER:
    for metre in ["Duple", "Triple", ""]:
        for swing in ["Straight", "Swing", ""]:
            key = (tonality, metre, swing)
            if key not in groups:
                continue
            label = f"{tonality} / {metre}" + (f" / {swing}" if swing else "")
            lines.append(f"  // ── {label} ({len(groups[key])} songs) ──")
            group_info.append((tonality, metre, swing, len(groups[key])))

            for s in groups[key]:
                song_count += 1
                safe_id = re.sub(r'[^a-z0-9]', '-', s["name"].lower()).strip('-')
                bars = notes_to_bars(s["scale_degrees"], s.get("time_sig", "4/4"))

                lines.append(f"  {{")
                lines.append(f'    id:"{safe_id}",')
                lines.append(f'    title:"{esc(s["name"])}",')
                lines.append(f'    key:"{esc(s.get("key_sig", "C major"))}",')
                lines.append(f'    timeSignature:"{esc(s.get("time_sig", "4/4"))}",')
                lines.append(f'    bars:[')

                for bar in bars:
                    melody_str = bar_to_ts(bar)
                    lines.append(f'      {{melody:{melody_str},chordRoman:"I"}},')

                lines.append(f'    ],')
                lines.append(f'  }},')

            lines.append("")

# Remaining groups
for key, group_songs in sorted(groups.items()):
    if key[0] in TONALITY_ORDER:
        continue
    label = f"{key[0]} / {key[1]}" + (f" / {key[2]}" if key[2] else "")
    lines.append(f"  // ── {label} ({len(group_songs)} songs) ──")
    group_info.append((key[0], key[1], key[2], len(group_songs)))
    for s in group_songs:
        song_count += 1
        safe_id = re.sub(r'[^a-z0-9]', '-', s["name"].lower()).strip('-')
        bars = notes_to_bars(s["scale_degrees"], s.get("time_sig", "4/4"))
        lines.append(f"  {{")
        lines.append(f'    id:"{safe_id}",')
        lines.append(f'    title:"{esc(s["name"])}",')
        lines.append(f'    key:"{esc(s.get("key_sig", "C major"))}",')
        lines.append(f'    timeSignature:"{esc(s.get("time_sig", "4/4"))}",')
        lines.append(f'    bars:[')
        for bar in bars:
            melody_str = bar_to_ts(bar)
            lines.append(f'      {{melody:{melody_str},chordRoman:"I"}},')
        lines.append(f'    ],')
        lines.append(f'  }},')
    lines.append("")

lines.append("];")
lines.append("")

# Group metadata
lines.append("export interface FolkSongGroup {")
lines.append("  tonality: string;")
lines.append("  metre: string;")
lines.append("  swing: string;")
lines.append("  label: string;")
lines.append("  count: number;")
lines.append("}")
lines.append("")
lines.append("export const FOLK_SONG_GROUPS: FolkSongGroup[] = [")
for t, m, sw, n in group_info:
    label = f"{t} / {m}" + (f" / {sw}" if sw else "")
    lines.append(f'  {{tonality:"{esc(t)}",metre:"{esc(m)}",swing:"{esc(sw)}",label:"{esc(label)}",count:{n}}},')
lines.append("];")

OUTPUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {song_count} songs ({len(group_info)} groups) to {OUTPUT}")
