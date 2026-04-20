"""Generate TypeScript data file from folk song JSON."""
import csv, re, os, json
from difflib import SequenceMatcher
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
JSON_PATH = SCRIPT_DIR / "folk_songs_output" / "folk_songs_degrees.json"
CSV_PATH = Path(os.path.expanduser("~/Downloads/Folk songs spreadsheet - Sheet1.csv"))
TS_PATH = SCRIPT_DIR.parent / "src" / "lib" / "folkSongData.ts"

with open(JSON_PATH, encoding="utf-8") as f:
    songs = json.load(f)

with open(CSV_PATH, encoding="utf-8") as f:
    rows = list(csv.reader(f))

# Build CSV lookup
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

# Enrich songs with CSV metadata
for s in songs:
    name = s["name"].lower()
    best_match = None
    best_score = 0
    for csv_name, meta in lookup.items():
        score = SequenceMatcher(None, name, csv_name).ratio()
        if score > best_score and score > 0.5:
            best_score = score
            best_match = meta
    if best_match:
        s["tonality"] = best_match["tonality"]
        s["metre"] = best_match["metre"]
        s["swing"] = best_match["swing"]
        s["tonal_functions"] = best_match["tonal_functions"]
        s["tradition"] = best_match["tradition"]
        s["start_solfege"] = best_match["start_solfege"]

# Save enriched JSON
with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(songs, f, indent=2, ensure_ascii=False)

# Generate TypeScript
def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')

lines = []
lines.append("// Auto-generated folk song data with scale degrees and rhythms")
lines.append("// Organization: Tonality > Metre > Swing > Harmonic Complexity")
lines.append("")
lines.append("export interface FolkNote {")
lines.append("  degree: string;")
lines.append("  octave: number;")
lines.append("  duration: string;")
lines.append("  dots: number;")
lines.append("  rest: boolean;")
lines.append("  quarterLength: number;")
lines.append("  tied: boolean;")
lines.append("}")
lines.append("")
lines.append("export interface FolkSong {")
lines.append("  name: string;")
lines.append("  tradition: string;")
lines.append("  tonality: string;")
lines.append("  metre: string;")
lines.append("  swing: string;")
lines.append("  tonal_functions: string;")
lines.append("  key_sig: string;")
lines.append("  time_sig: string;")
lines.append("  starting_note: string;")
lines.append("  start_solfege: string;")
lines.append("  notes: FolkNote[];")
lines.append("}")
lines.append("")

# Group by tonality > metre > swing
groups = defaultdict(list)
for s in songs:
    key = (s.get("tonality", "Major"), s.get("metre", "Duple"), s.get("swing", "Straight"))
    groups[key].append(s)

TONALITY_ORDER = [
    "Major", "Major pentatonic", "Minor", "Minor pentatonic", "Minor, full",
    "Dorian", "Dorian/aeolian", "Mixolydian", "Aeolian", "Phrygian",
    "Phrygian Dominant", "Lydian", "Hijaz", "Hijaz-Nahawand", "Bayati",
]

def song_to_ts(s):
    notes = []
    for n in s.get("scale_degrees", []):
        rest = "true" if n["is_rest"] else "false"
        tied = "true" if n.get("tied") else "false"
        notes.append(
            f'{{degree:"{esc(n["scale_degree"])}",octave:{n["octave_offset"]},'
            f'duration:"{n["duration_type"]}",dots:{n["dots"]},'
            f'rest:{rest},quarterLength:{n["quarterLength"]},tied:{tied}}}'
        )
    notes_str = ",".join(notes)
    return (
        f'  {{\n'
        f'    name:"{esc(s["name"])}",tradition:"{esc(s.get("tradition",""))}",\n'
        f'    tonality:"{esc(s.get("tonality","Major"))}",metre:"{esc(s.get("metre","Duple"))}",swing:"{esc(s.get("swing","Straight"))}",\n'
        f'    tonal_functions:"{esc(s.get("tonal_functions",""))}",\n'
        f'    key_sig:"{esc(s.get("key_sig","C major"))}",time_sig:"{esc(s.get("time_sig","4/4"))}",\n'
        f'    starting_note:"{esc(s.get("starting_note","1"))}",start_solfege:"{esc(s.get("start_solfege",""))}",\n'
        f'    notes:[{notes_str}],\n'
        f'  }},'
    )

lines.append("export const FOLK_SONGS: FolkSong[] = [")

added_groups = set()
for tonality in TONALITY_ORDER:
    for metre in ["Duple", "Triple", ""]:
        for swing in ["Straight", "Swing", ""]:
            key = (tonality, metre, swing)
            if key not in groups:
                continue
            added_groups.add(key)
            label = f"{tonality} / {metre}" + (f" / {swing}" if swing else "")
            lines.append(f"  // ── {label} ──")
            for s in groups[key]:
                lines.append(song_to_ts(s))
            lines.append("")

# Remaining groups
for key, group_songs in sorted(groups.items()):
    if key in added_groups:
        continue
    label = f"{key[0]} / {key[1]}" + (f" / {key[2]}" if key[2] else "")
    lines.append(f"  // ── {label} ──")
    for s in group_songs:
        lines.append(song_to_ts(s))
    lines.append("")

lines.append("];")
lines.append("")

# Group metadata for UI
lines.append("export interface FolkSongGroup {")
lines.append("  tonality: string;")
lines.append("  metre: string;")
lines.append("  swing: string;")
lines.append("  label: string;")
lines.append("  count: number;")
lines.append("}")
lines.append("")
lines.append("export const FOLK_SONG_GROUPS: FolkSongGroup[] = [")

added_groups2 = set()
for tonality in TONALITY_ORDER:
    for metre in ["Duple", "Triple", ""]:
        for swing in ["Straight", "Swing", ""]:
            key = (tonality, metre, swing)
            if key in groups and key not in added_groups2:
                n = len(groups[key])
                label = f"{tonality} / {metre}" + (f" / {swing}" if swing else "")
                lines.append(f'  {{tonality:"{esc(tonality)}",metre:"{esc(metre)}",swing:"{esc(swing)}",label:"{esc(label)}",count:{n}}},')
                added_groups2.add(key)

for key in sorted(groups.keys()):
    if key not in added_groups2:
        n = len(groups[key])
        label = f"{key[0]} / {key[1]}" + (f" / {key[2]}" if key[2] else "")
        lines.append(f'  {{tonality:"{esc(key[0])}",metre:"{esc(key[1])}",swing:"{esc(key[2])}",label:"{esc(label)}",count:{n}}},')

lines.append("];")

TS_PATH.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {len(songs)} songs to {TS_PATH}")
print(f"Groups: {len(added_groups2)}")
for key in sorted(added_groups2):
    print(f"  {key[0]:20s} {key[1]:8s} {key[2]:10s} ({len(groups[key])} songs)")
